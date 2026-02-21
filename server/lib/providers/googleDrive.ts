import crypto from "crypto";
import { encryptToken, decryptToken } from "../tokenEncryption";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

interface OAuthState {
  orgId: number;
  provider: string;
  nonce: string;
  userId: string;
}

export function encodeOAuthState(orgId: number, userId: string): string {
  const state: OAuthState = {
    orgId,
    provider: "google_drive",
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

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
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
    scopes: data.scope,
  };
}

export async function refreshAccessToken(
  refreshTokenEncrypted: string
): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const refreshToken = decryptToken(refreshTokenEncrypted);

  const response = await fetch(GOOGLE_TOKEN_URL, {
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
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  const data = await response.json();
  return {
    email: data.email,
    name: data.name || data.email,
  };
}

export async function revokeToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${GOOGLE_REVOKE_URL}?token=${accessToken}`, {
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<{ id: string; name: string }> {
  const metadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  
  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create folder: ${error}`);
  }

  return response.json();
}

export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<{ id: string; name: string }> {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQuery}`;

  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!searchResponse.ok) {
    throw new Error("Failed to search for folder");
  }

  const searchData = await searchResponse.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }

  return createFolder(accessToken, folderName, parentId);
}

export async function uploadFile(
  accessToken: string,
  fileName: string,
  content: Buffer | string,
  mimeType: string,
  parentId: string
): Promise<{ id: string; name: string }> {
  const metadata = {
    name: fileName,
    parents: [parentId],
  };

  const boundary = "-------fieldscope_boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n`
    ),
    contentBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  return response.json();
}

export async function getFolderInfo(
  accessToken: string,
  folderId: string
): Promise<{ id: string; name: string; path: string } | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    const pathParts: string[] = [data.name];
    let currentParents = data.parents;
    
    while (currentParents && currentParents.length > 0) {
      const parentId = currentParents[0];
      const parentResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${parentId}?fields=id,name,parents`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      
      if (!parentResponse.ok) break;
      
      const parentData = await parentResponse.json();
      if (parentData.name === "My Drive" || !parentData.parents) {
        break;
      }
      pathParts.unshift(parentData.name);
      currentParents = parentData.parents;
    }

    return {
      id: data.id,
      name: data.name,
      path: "/" + pathParts.join("/"),
    };
  } catch {
    return null;
  }
}

export function parseFolderIdFromUrl(input: string): string {
  const trimmed = input.trim();
  
  const urlPatterns = [
    /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/drive\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return match[1];
    }
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export async function validateFolderAccess(
  accessToken: string,
  folderId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const folderInfo = await getFolderInfo(accessToken, folderId);
    if (!folderInfo) {
      return { valid: false, error: "Folder not found or not accessible" };
    }

    const testFileName = `fieldscope_permission_test_${Date.now()}.txt`;
    const testFile = await uploadFile(
      accessToken,
      testFileName,
      "FieldScope permission test - this file can be deleted",
      "text/plain",
      folderId
    );

    await fetch(`https://www.googleapis.com/drive/v3/files/${testFile.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || "Failed to validate folder access" };
  }
}
