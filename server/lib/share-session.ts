import crypto from "crypto";

const SHARE_COOKIE_NAME = "fs_share_session";
const TOKEN_VERSION = 1;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ShareSession {
  linkId: string;
  projectId: number;
  orgId: number;
  role: "contributor" | "viewer";
  issuedAt: number;
  version: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for share sessions");
  }
  return secret;
}

function sign(payload: string): string {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(payload);
  return hmac.digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = sign(payload);
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

export function createShareSessionToken(session: Omit<ShareSession, "issuedAt" | "version">): string {
  const fullSession: ShareSession = {
    ...session,
    issuedAt: Date.now(),
    version: TOKEN_VERSION,
  };
  
  const payload = JSON.stringify(fullSession);
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = sign(payloadB64);
  
  return `${payloadB64}.${signature}`;
}

export function parseShareSessionToken(token: string): ShareSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    
    const [payloadB64, signature] = parts;
    
    if (!verify(payloadB64, signature)) {
      console.log("[ShareSession] Invalid signature");
      return null;
    }
    
    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const session: ShareSession = JSON.parse(payload);
    
    if (session.version !== TOKEN_VERSION) {
      console.log("[ShareSession] Token version mismatch");
      return null;
    }
    
    const age = Date.now() - session.issuedAt;
    if (age > TOKEN_TTL_MS) {
      console.log("[ShareSession] Token expired");
      return null;
    }
    
    return session;
  } catch (error) {
    console.log("[ShareSession] Failed to parse token:", error);
    return null;
  }
}

export function getShareCookieName(): string {
  return SHARE_COOKIE_NAME;
}

export function getShareCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_MS,
  };
}

export function clearShareCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}

export const BLOCKED_PATHS_IN_SHARE_MODE = [
  "/api/projects",
  "/api/billing",
  "/api/settings",
  "/api/team",
  "/api/organizations",
  "/api/addons",
  "/api/guest-links",
  "/api/cloud-storage",
  "/api/users",
];

export function isBlockedInShareMode(path: string): boolean {
  if (path === "/api/projects/active" || path === "/api/projects/archived" || path === "/api/projects/archived/years") {
    return true;
  }
  
  for (const blocked of BLOCKED_PATHS_IN_SHARE_MODE) {
    if (path === blocked || path.startsWith(blocked + "/")) {
      const afterBlocked = path.slice(blocked.length);
      if (afterBlocked === "" || afterBlocked.startsWith("/")) {
        if (blocked === "/api/projects" && /^\/\d+/.test(afterBlocked)) {
          continue;
        }
        return true;
      }
    }
  }
  
  return false;
}
