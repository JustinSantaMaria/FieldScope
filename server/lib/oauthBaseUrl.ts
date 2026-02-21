const ALLOWED_HOSTS = new Set<string>();

function initializeAllowedHosts() {
  if (ALLOWED_HOSTS.size > 0) return;
  
  const prodUrl = process.env.APP_BASE_URL;
  const stagingUrl = process.env.APP_BASE_URL_STAGING;
  
  if (prodUrl) {
    try {
      const url = new URL(prodUrl);
      ALLOWED_HOSTS.add(url.host);
    } catch (e) {
      console.error("Invalid APP_BASE_URL:", prodUrl);
    }
  }
  
  if (stagingUrl) {
    try {
      const url = new URL(stagingUrl);
      ALLOWED_HOSTS.add(url.host);
    } catch (e) {
      console.error("Invalid APP_BASE_URL_STAGING:", stagingUrl);
    }
  }
  
  ALLOWED_HOSTS.add("localhost:5000");
  ALLOWED_HOSTS.add("127.0.0.1:5000");
}

export function getOAuthBaseUrl(requestHost: string): string {
  initializeAllowedHosts();
  
  if (ALLOWED_HOSTS.has(requestHost)) {
    const protocol = requestHost.includes("localhost") || requestHost.includes("127.0.0.1") 
      ? "http" 
      : "https";
    return `${protocol}://${requestHost}`;
  }
  
  const prodUrl = process.env.APP_BASE_URL;
  if (prodUrl) {
    return prodUrl.replace(/\/$/, "");
  }
  
  const stagingUrl = process.env.APP_BASE_URL_STAGING;
  if (stagingUrl) {
    return stagingUrl.replace(/\/$/, "");
  }
  
  return `https://${requestHost}`;
}

export function isAllowedHost(host: string): boolean {
  initializeAllowedHosts();
  return ALLOWED_HOSTS.has(host);
}

export function getConfiguredRedirectUris(provider: "google_drive" | "onedrive" | "dropbox"): { staging: string | null; production: string | null } {
  const callbackPath = `/api/integrations/${provider}/callback`;
  
  const prodUrl = process.env.APP_BASE_URL;
  const stagingUrl = process.env.APP_BASE_URL_STAGING;
  
  return {
    staging: stagingUrl ? `${stagingUrl.replace(/\/$/, "")}${callbackPath}` : null,
    production: prodUrl ? `${prodUrl.replace(/\/$/, "")}${callbackPath}` : null,
  };
}

export function getAllRedirectUris(): {
  google_drive: { staging: string | null; production: string | null };
  onedrive: { staging: string | null; production: string | null };
  dropbox: { staging: string | null; production: string | null };
} {
  return {
    google_drive: getConfiguredRedirectUris("google_drive"),
    onedrive: getConfiguredRedirectUris("onedrive"),
    dropbox: getConfiguredRedirectUris("dropbox"),
  };
}

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  
  if (!process.env.TOKEN_ENCRYPTION_KEY) missing.push("TOKEN_ENCRYPTION_KEY");
  if (!process.env.APP_BASE_URL && !process.env.APP_BASE_URL_STAGING) {
    missing.push("APP_BASE_URL or APP_BASE_URL_STAGING");
  }
  
  return missing;
}

export function getProviderEnvStatus(): {
  google_drive: { configured: boolean; missing: string[] };
  onedrive: { configured: boolean; missing: string[] };
  dropbox: { configured: boolean; missing: string[] };
} {
  const googleMissing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) googleMissing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) googleMissing.push("GOOGLE_CLIENT_SECRET");
  
  const microsoftMissing: string[] = [];
  if (!process.env.MICROSOFT_CLIENT_ID) microsoftMissing.push("MICROSOFT_CLIENT_ID");
  if (!process.env.MICROSOFT_CLIENT_SECRET) microsoftMissing.push("MICROSOFT_CLIENT_SECRET");
  
  const dropboxMissing: string[] = [];
  if (!process.env.DROPBOX_CLIENT_ID) dropboxMissing.push("DROPBOX_CLIENT_ID");
  if (!process.env.DROPBOX_CLIENT_SECRET) dropboxMissing.push("DROPBOX_CLIENT_SECRET");
  
  return {
    google_drive: { configured: googleMissing.length === 0, missing: googleMissing },
    onedrive: { configured: microsoftMissing.length === 0, missing: microsoftMissing },
    dropbox: { configured: dropboxMissing.length === 0, missing: dropboxMissing },
  };
}
