import { integrationStorage } from "../integrationStorage";
import { encryptToken, decryptToken } from "./tokenEncryption";
import * as googleDrive from "./providers/googleDrive";
import * as dropbox from "./providers/dropbox";
import * as onedrive from "./providers/onedrive";
import { INTEGRATION_PROVIDERS, INTEGRATION_STATUS, AUDIT_ACTION_TYPES, SYNC_JOB_STATUS } from "@shared/schema";
import type { OrgIntegration } from "@shared/schema";

export interface SyncFile {
  fileName: string;
  content: Buffer;
  mimeType: string;
}

export interface SyncResult {
  success: boolean;
  filesUploaded: number;
  errors: string[];
}

async function ensureValidToken(integration: OrgIntegration): Promise<string> {
  if (!integration.accessTokenEncrypted) {
    throw new Error("No access token available");
  }

  const now = new Date();
  const expiresAt = integration.tokenExpiresAt;
  
  const bufferTime = 5 * 60 * 1000;
  if (expiresAt && now.getTime() + bufferTime < expiresAt.getTime()) {
    return decryptToken(integration.accessTokenEncrypted);
  }

  if (!integration.refreshTokenEncrypted) {
    throw new Error("Token expired and no refresh token available");
  }

  let newAccessToken: string;
  let newExpiresAt: Date;

  switch (integration.provider) {
    case INTEGRATION_PROVIDERS.GOOGLE_DRIVE:
      const googleResult = await googleDrive.refreshAccessToken(integration.refreshTokenEncrypted);
      newAccessToken = googleResult.accessToken;
      newExpiresAt = googleResult.expiresAt;
      break;
    case INTEGRATION_PROVIDERS.DROPBOX:
      const dropboxResult = await dropbox.refreshAccessToken(integration.refreshTokenEncrypted);
      newAccessToken = dropboxResult.accessToken;
      newExpiresAt = dropboxResult.expiresAt;
      break;
    case INTEGRATION_PROVIDERS.ONEDRIVE:
      const onedriveResult = await onedrive.refreshAccessToken(integration.refreshTokenEncrypted);
      newAccessToken = onedriveResult.accessToken;
      newExpiresAt = onedriveResult.expiresAt;
      break;
    default:
      throw new Error(`Unsupported provider: ${integration.provider}`);
  }

  await integrationStorage.updateIntegration(integration.id, {
    accessTokenEncrypted: encryptToken(newAccessToken),
    tokenExpiresAt: newExpiresAt,
  });

  await integrationStorage.logAuditEvent({
    orgId: integration.orgId,
    provider: integration.provider,
    actionType: AUDIT_ACTION_TYPES.TOKEN_REFRESH,
    details: "Token refreshed during sync",
  });

  return newAccessToken;
}

async function uploadToGoogleDrive(
  accessToken: string,
  folderId: string,
  files: SyncFile[]
): Promise<{ uploaded: number; errors: string[] }> {
  let uploaded = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      await googleDrive.uploadFile(
        accessToken,
        file.fileName,
        file.content,
        file.mimeType,
        folderId
      );
      uploaded++;
    } catch (error: any) {
      errors.push(`${file.fileName}: ${error.message}`);
    }
  }

  return { uploaded, errors };
}

async function uploadToDropbox(
  accessToken: string,
  folderPath: string,
  files: SyncFile[]
): Promise<{ uploaded: number; errors: string[] }> {
  let uploaded = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      await dropbox.uploadFile(
        accessToken,
        file.fileName,
        file.content,
        folderPath
      );
      uploaded++;
    } catch (error: any) {
      errors.push(`${file.fileName}: ${error.message}`);
    }
  }

  return { uploaded, errors };
}

async function uploadToOneDrive(
  accessToken: string,
  folderId: string,
  files: SyncFile[]
): Promise<{ uploaded: number; errors: string[] }> {
  let uploaded = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      await onedrive.uploadFile(
        accessToken,
        file.fileName,
        file.content,
        folderId
      );
      uploaded++;
    } catch (error: any) {
      errors.push(`${file.fileName}: ${error.message}`);
    }
  }

  return { uploaded, errors };
}

export async function syncFilesToCloud(
  orgId: number,
  provider: string,
  files: SyncFile[],
  userId?: string
): Promise<SyncResult> {
  const integration = await integrationStorage.getIntegration(orgId, provider);
  
  if (!integration) {
    return { success: false, filesUploaded: 0, errors: ["Integration not found"] };
  }

  if (integration.status !== INTEGRATION_STATUS.READY) {
    return { success: false, filesUploaded: 0, errors: ["Integration not ready"] };
  }

  if (!integration.selectedFolderId && !integration.selectedFolderPath) {
    return { success: false, filesUploaded: 0, errors: ["No destination folder configured"] };
  }

  await integrationStorage.logAuditEvent({
    orgId,
    provider,
    actionType: AUDIT_ACTION_TYPES.SYNC_START,
    userId: userId || null,
    details: `Starting sync of ${files.length} files`,
  });

  try {
    const accessToken = await ensureValidToken(integration);
    let result: { uploaded: number; errors: string[] };

    switch (provider) {
      case INTEGRATION_PROVIDERS.GOOGLE_DRIVE:
        result = await uploadToGoogleDrive(accessToken, integration.selectedFolderId!, files);
        break;
      case INTEGRATION_PROVIDERS.DROPBOX:
        result = await uploadToDropbox(accessToken, integration.selectedFolderPath!, files);
        break;
      case INTEGRATION_PROVIDERS.ONEDRIVE:
        result = await uploadToOneDrive(accessToken, integration.selectedFolderId!, files);
        break;
      default:
        return { success: false, filesUploaded: 0, errors: [`Unsupported provider: ${provider}`] };
    }

    await integrationStorage.updateIntegration(integration.id, {
      lastSyncAt: new Date(),
    });

    if (result.errors.length === 0) {
      await integrationStorage.logAuditEvent({
        orgId,
        provider,
        actionType: AUDIT_ACTION_TYPES.SYNC_SUCCESS,
        userId: userId || null,
        details: `Synced ${result.uploaded} files successfully`,
      });
    } else {
      await integrationStorage.logAuditEvent({
        orgId,
        provider,
        actionType: AUDIT_ACTION_TYPES.SYNC_FAIL,
        userId: userId || null,
        details: `Synced ${result.uploaded}/${files.length} files`,
        errorMessage: result.errors.join("; "),
      });
    }

    return {
      success: result.errors.length === 0,
      filesUploaded: result.uploaded,
      errors: result.errors,
    };
  } catch (error: any) {
    await integrationStorage.logAuditEvent({
      orgId,
      provider,
      actionType: AUDIT_ACTION_TYPES.SYNC_FAIL,
      userId: userId || null,
      errorMessage: error.message,
    });

    if (error.message.includes("Token") || error.message.includes("401")) {
      await integrationStorage.updateIntegration(integration.id, {
        status: INTEGRATION_STATUS.ERROR,
        errorCode: "TOKEN_ERROR",
        errorMessage: "Authentication failed. Please reconnect.",
      });
    }

    return { success: false, filesUploaded: 0, errors: [error.message] };
  }
}

export async function createSyncJob(
  exportSessionId: number,
  provider: string,
  orgId: number,
  totalFiles: number,
  userId: string
): Promise<number> {
  const job = await integrationStorage.createSyncJob({
    exportSessionId,
    provider,
    orgId,
    status: SYNC_JOB_STATUS.PENDING,
    totalFiles,
    createdBy: userId,
  });
  return job.id;
}

export async function updateSyncJobProgress(
  jobId: number,
  uploadedFiles: number,
  status?: string
): Promise<void> {
  const updates: any = { uploadedFiles };
  
  if (status === SYNC_JOB_STATUS.IN_PROGRESS) {
    updates.status = status;
    updates.startedAt = new Date();
  } else if (status === SYNC_JOB_STATUS.SUCCESS || status === SYNC_JOB_STATUS.FAILED) {
    updates.status = status;
    updates.completedAt = new Date();
  }

  await integrationStorage.updateSyncJob(jobId, updates);
}

export async function failSyncJob(
  jobId: number,
  errorMessage: string
): Promise<void> {
  await integrationStorage.updateSyncJob(jobId, {
    status: SYNC_JOB_STATUS.FAILED,
    completedAt: new Date(),
    errorMessage,
  });
}

interface ExportSyncResult {
  provider: string;
  success: boolean;
  filesUploaded: number;
  errors: string[];
}

export async function syncExportToCloud(
  orgId: number,
  exportId: number,
  userId: string
): Promise<ExportSyncResult[]> {
  const readyIntegrations = await integrationStorage.getReadyIntegrations(orgId);
  
  if (readyIntegrations.length === 0) {
    throw new Error("No cloud storage integrations are ready");
  }

  const { storage } = await import("../storage");
  const exp = await storage.getExport(exportId);
  
  if (!exp) {
    throw new Error("Export not found");
  }
  
  if (exp.status !== "ready" || !exp.fileUrl) {
    throw new Error("Export is not ready for sync");
  }

  const results: ExportSyncResult[] = [];

  for (const integration of readyIntegrations) {
    try {
      const response = await fetch(exp.fileUrl);
      if (!response.ok) {
        results.push({
          provider: integration.provider,
          success: false,
          filesUploaded: 0,
          errors: [`Failed to fetch export file`],
        });
        continue;
      }
      
      const buffer = await response.arrayBuffer();
      
      let fileName = `export_${exp.id}`;
      let mimeType = 'application/octet-stream';
      
      if (exp.type === 'pdf') {
        fileName = `${fileName}.pdf`;
        mimeType = 'application/pdf';
      } else if (exp.type === 'csv') {
        fileName = `${fileName}.csv`;
        mimeType = 'text/csv';
      } else if (exp.type === 'photos' || exp.type === 'full') {
        fileName = `${fileName}.zip`;
        mimeType = 'application/zip';
      }
      
      const files: SyncFile[] = [{
        fileName,
        content: Buffer.from(buffer),
        mimeType,
      }];

      const result = await syncFilesToCloud(
        orgId,
        integration.provider,
        files,
        userId
      );
      
      results.push({
        provider: integration.provider,
        success: result.success,
        filesUploaded: result.filesUploaded,
        errors: result.errors,
      });
    } catch (error: any) {
      results.push({
        provider: integration.provider,
        success: false,
        filesUploaded: 0,
        errors: [error.message],
      });
    }
  }

  return results;
}
