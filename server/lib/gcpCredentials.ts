import { Storage } from "@google-cloud/storage";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedCredentials: ServiceAccountCredentials | null = null;
let credentialsChecked = false;

export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  if (credentialsChecked) {
    return cachedCredentials;
  }

  credentialsChecked = true;

  let jsonString: string | undefined;

  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    jsonString = process.env.GCP_SERVICE_ACCOUNT_JSON;
  } else if (process.env.GCP_SERVICE_ACCOUNT_JSON_B64) {
    try {
      jsonString = Buffer.from(
        process.env.GCP_SERVICE_ACCOUNT_JSON_B64,
        "base64"
      ).toString("utf-8");
    } catch (err) {
      console.error("[GCP] Failed to decode base64 service account JSON:", err);
      return null;
    }
  }

  if (!jsonString) {
    console.log("[GCP] No service account credentials found (GCP_SERVICE_ACCOUNT_JSON or GCP_SERVICE_ACCOUNT_JSON_B64)");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonString);

    if (!parsed.client_email || typeof parsed.client_email !== "string") {
      console.error("[GCP] Invalid service account JSON: missing client_email");
      return null;
    }

    if (!parsed.private_key || typeof parsed.private_key !== "string") {
      console.error("[GCP] Invalid service account JSON: missing private_key");
      return null;
    }

    let privateKey = parsed.private_key;
    if (privateKey.includes("\\n")) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    cachedCredentials = {
      client_email: parsed.client_email,
      private_key: privateKey,
      project_id: parsed.project_id,
    };

    const domain = parsed.client_email.split("@")[1] || "unknown";
    console.log(`[GCP] Service account credentials loaded: clientEmailDomain=${domain}`);

    return cachedCredentials;
  } catch (err) {
    console.error("[GCP] Failed to parse service account JSON:", err);
    return null;
  }
}

export function hasServiceAccountCredentials(): boolean {
  return getServiceAccountCredentials() !== null;
}

export function getCredentialsDomain(): string | null {
  const creds = getServiceAccountCredentials();
  if (!creds) return null;
  return creds.client_email.split("@")[1] || null;
}

let signingStorageClient: Storage | null = null;

export function getSigningStorageClient(): Storage {
  if (signingStorageClient) {
    return signingStorageClient;
  }

  const credentials = getServiceAccountCredentials();
  
  if (!credentials) {
    throw new Error(
      "Missing GCP service account credentials for URL signing. " +
      "Set GCP_SERVICE_ACCOUNT_JSON or GCP_SERVICE_ACCOUNT_JSON_B64 in Secrets."
    );
  }

  const projectId = credentials.project_id || process.env.GCP_PROJECT_ID;

  signingStorageClient = new Storage({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId,
  });

  return signingStorageClient;
}
