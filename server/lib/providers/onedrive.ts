import crypto from "crypto";
import { decryptToken } from "../tokenEncryption";

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH_URL = "https://graph.microsoft.com/v1.0";

const SCOPES = [
  "Files.ReadWrite.All",
  "User.Read",
  "offline_access",
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
    provider: "onedrive",
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

function getTenant(): string {
  return process.env.MICROSOFT_TENANT || "common";
}

export function getOneDriveAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID is not configured");
  }

  const tenant = getTenant();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    response_mode: "query",
    state,
  });

  return `${MICROSOFT_AUTH_URL}/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
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
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = getTenant();

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials not configured");
  }

  const response = await fetch(`${MICROSOFT_AUTH_URL}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: SCOPES,
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
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = getTenant();

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials not configured");
  }

  const refreshToken = decryptToken(refreshTokenEncrypted);

  const response = await fetch(`${MICROSOFT_AUTH_URL}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
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
  const response = await fetch(`${MICROSOFT_GRAPH_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  const data = await response.json();
  return {
    email: data.mail || data.userPrincipalName,
    name: data.displayName || data.mail || data.userPrincipalName,
  };
}

export async function revokeToken(accessToken: string): Promise<boolean> {
  return true;
}

export async function createFolder(
  accessToken: string,
  folderPath: string
): Promise<{ id: string; path: string }> {
  const pathParts = folderPath.split("/").filter(Boolean);
  let currentPath = "";
  let currentId = "root";

  for (const part of pathParts) {
    currentPath += "/" + part;
    
    const searchUrl = currentId === "root"
      ? `${MICROSOFT_GRAPH_URL}/me/drive/root/children?$filter=name eq '${encodeURIComponent(part)}'`
      : `${MICROSOFT_GRAPH_URL}/me/drive/items/${currentId}/children?$filter=name eq '${encodeURIComponent(part)}'`;

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const existing = searchData.value?.find((item: any) => item.folder && item.name === part);
      
      if (existing) {
        currentId = existing.id;
        continue;
      }
    }

    const createUrl = currentId === "root"
      ? `${MICROSOFT_GRAPH_URL}/me/drive/root/children`
      : `${MICROSOFT_GRAPH_URL}/me/drive/items/${currentId}/children`;

    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: part,
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create folder: ${error}`);
    }

    const createData = await createResponse.json();
    currentId = createData.id;
  }

  return {
    id: currentId,
    path: "/" + pathParts.join("/"),
  };
}

export async function getFolderInfo(
  accessToken: string,
  folderPath: string
): Promise<{ id: string; path: string } | null> {
  try {
    const normalizedPath = folderPath.startsWith("/") ? folderPath.slice(1) : folderPath;
    
    const response = await fetch(
      `${MICROSOFT_GRAPH_URL}/me/drive/root:/${encodeURIComponent(normalizedPath)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data.folder) {
      return null;
    }

    return {
      id: data.id,
      path: data.parentReference?.path 
        ? `${data.parentReference.path.replace("/drive/root:", "")}/${data.name}` 
        : `/${data.name}`,
    };
  } catch {
    return null;
  }
}

export async function uploadFile(
  accessToken: string,
  fileName: string,
  content: Buffer | string,
  folderId: string
): Promise<{ id: string; path: string }> {
  const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;

  const uploadUrl = folderId === "root"
    ? `${MICROSOFT_GRAPH_URL}/me/drive/root:/${encodeURIComponent(fileName)}:/content`
    : `${MICROSOFT_GRAPH_URL}/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
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
    path: data.parentReference?.path 
      ? `${data.parentReference.path.replace("/drive/root:", "")}/${data.name}`
      : `/${data.name}`,
  };
}

export async function deleteFile(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${MICROSOFT_GRAPH_URL}/me/drive/items/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.ok || response.status === 204;
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
): Promise<{ valid: boolean; folderId?: string; error?: string }> {
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
      folderInfo.id
    );

    await deleteFile(accessToken, testFile.id);

    return { valid: true, folderId: folderInfo.id };
  } catch (error: any) {
    return { valid: false, error: error.message || "Failed to validate folder access" };
  }
}
