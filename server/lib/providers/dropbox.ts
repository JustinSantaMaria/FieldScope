import crypto from "crypto";
import { decryptToken } from "../tokenEncryption";

const DROPBOX_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_API_URL = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_URL = "https://content.dropboxapi.com/2";

interface OAuthState {
  orgId: number;
  provider: string;
  nonce: string;
  userId: string;
}

export function encodeOAuthState(orgId: number, userId: string): string {
  const state: OAuthState = {
    orgId,
    provider: "dropbox",
    nonce: crypto.randomBytes(16).toString("hex"),
    userId,
  };
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthState(stateParam: string): OAuthState | null {
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf8");
    return JSON.parse(decoded) as OAuthState;
  } catch {
    return null;
  }
}

export function getDropboxAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.DROPBOX_CLIENT_ID;
  if (!clientId) {
    throw new Error("DROPBOX_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    token_access_type: "offline",
    state,
  });

  return `${DROPBOX_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  account_id: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  accountId: string;
}> {
  const clientId = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Dropbox OAuth credentials not configured");
  }

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data: TokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt,
    accountId: data.account_id,
  };
}

export async function refreshAccessToken(
  refreshTokenEncrypted: string
): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const clientId = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Dropbox OAuth credentials not configured");
  }

  const refreshToken = decryptToken(refreshTokenEncrypted);

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data: TokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

interface UserInfo {
  email: string;
  name: string;
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(`${DROPBOX_API_URL}/users/get_current_account`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "null",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  const data = await response.json();
  return {
    email: data.email,
    name: data.name?.display_name || data.email,
  };
}

export async function revokeToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${DROPBOX_API_URL}/auth/token/revoke`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "null",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createFolder(
  accessToken: string,
  folderPath: string
): Promise<{ id: string; path: string }> {
  const response = await fetch(`${DROPBOX_API_URL}/files/create_folder_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: folderPath,
      autorename: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (error?.error?.[".tag"] === "path" && error.error.path?.[".tag"] === "conflict") {
      const existing = await getFolderInfo(accessToken, folderPath);
      if (existing) {
        return existing;
      }
    }
    throw new Error(`Failed to create folder: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return {
    id: data.metadata.id,
    path: data.metadata.path_display,
  };
}

export async function getFolderInfo(
  accessToken: string,
  folderPath: string
): Promise<{ id: string; path: string } | null> {
  try {
    const response = await fetch(`${DROPBOX_API_URL}/files/get_metadata`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: folderPath }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data[".tag"] !== "folder") {
      return null;
    }
    
    return {
      id: data.id,
      path: data.path_display,
    };
  } catch {
    return null;
  }
}

export async function uploadFile(
  accessToken: string,
  fileName: string,
  content: Buffer | string,
  folderPath: string
): Promise<{ id: string; path: string }> {
  const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;
  const filePath = `${folderPath}/${fileName}`;

  const response = await fetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: filePath,
        mode: { ".tag": "overwrite" },
        autorename: false,
        mute: true,
      }),
    },
    body: contentBuffer,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    path: data.path_display,
  };
}

export async function deleteFile(
  accessToken: string,
  filePath: string
): Promise<boolean> {
  try {
    const response = await fetch(`${DROPBOX_API_URL}/files/delete_v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: filePath }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function parseFolderPath(input: string): string {
  let path = input.trim();
  
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  
  if (path.endsWith("/") && path.length > 1) {
    path = path.slice(0, -1);
  }
  
  return path;
}

export async function validateFolderAccess(
  accessToken: string,
  folderPath: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    let normalizedPath = parseFolderPath(folderPath);
    
    let folderInfo = await getFolderInfo(accessToken, normalizedPath);
    if (!folderInfo) {
      const created = await createFolder(accessToken, normalizedPath);
      folderInfo = created;
    }

    const testFileName = `fieldscope_permission_test_${Date.now()}.txt`;
    const testFile = await uploadFile(
      accessToken,
      testFileName,
      "FieldScope permission test - this file can be deleted",
      normalizedPath
    );

    await deleteFile(accessToken, testFile.path);

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || "Failed to validate folder access" };
  }
}
