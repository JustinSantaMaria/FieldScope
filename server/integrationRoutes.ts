import { Express, Request, Response, NextFunction } from "express";
import { integrationStorage } from "./integrationStorage";
import { 
  INTEGRATION_PROVIDERS, 
  INTEGRATION_STATUS, 
  AUDIT_ACTION_TYPES,
} from "@shared/schema";
import { getOAuthBaseUrl, getAllRedirectUris, getMissingEnvVars, getProviderEnvStatus } from "./lib/oauthBaseUrl";
import { isEncryptionKeyConfigured } from "./lib/tokenEncryption";
import * as googleDrive from "./lib/providers/googleDrive";
import * as dropbox from "./lib/providers/dropbox";
import * as onedrive from "./lib/providers/onedrive";
import { authStorage } from "./replit_integrations/auth/storage";
import { syncExportToCloud } from "./lib/cloudSyncService";

const TEMP_ORG_ID = 1;

function getCurrentUserId(req: Request): string | null {
  const user = req.user as any;
  if (!user) return null;
  return user.claims?.sub || user.id || null;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    next();
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}

export function registerIntegrationRoutes(app: Express): void {
  app.get("/api/integrations/config", async (req, res) => {
    try {
      const redirectUris = getAllRedirectUris();
      const missingEnvVars = getMissingEnvVars();
      const providerStatus = getProviderEnvStatus();
      const encryptionConfigured = isEncryptionKeyConfigured();

      res.json({
        redirectUris,
        missingEnvVars,
        providerStatus,
        encryptionConfigured,
        stagingUrl: process.env.APP_BASE_URL_STAGING || null,
        productionUrl: process.env.APP_BASE_URL || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const integrations = await integrationStorage.getIntegrationsByOrg(TEMP_ORG_ID);
      
      const sanitized = integrations.map(i => ({
        id: i.id,
        orgId: i.orgId,
        provider: i.provider,
        status: i.status,
        accountEmail: i.accountEmail,
        accountName: i.accountName,
        selectedFolderId: i.selectedFolderId,
        selectedFolderPath: i.selectedFolderPath,
        selectedFolderDisplayPath: i.selectedFolderDisplayPath,
        connectedByUserId: i.connectedByUserId,
        connectedAt: i.connectedAt,
        lastSyncAt: i.lastSyncAt,
        errorCode: i.errorCode,
        errorMessage: i.errorMessage,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      }));

      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/:provider/connect", requireAdmin, async (req, res) => {
    try {
      const provider = req.params.provider;
      const userId = getCurrentUserId(req);

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const validProviders = Object.values(INTEGRATION_PROVIDERS);
      if (!validProviders.includes(provider as any)) {
        return res.status(400).json({ message: `Provider ${provider} not supported` });
      }

      if (!isEncryptionKeyConfigured()) {
        return res.status(400).json({ message: "TOKEN_ENCRYPTION_KEY not configured" });
      }

      const providerStatus = getProviderEnvStatus();
      const providerKey = provider as keyof typeof providerStatus;
      if (!providerStatus[providerKey]?.configured) {
        return res.status(400).json({ 
          message: `${provider} not configured`,
          missing: providerStatus[providerKey]?.missing || [],
        });
      }

      const baseUrl = getOAuthBaseUrl(req.get("host") || "");
      let authUrl: string;

      switch (provider) {
        case INTEGRATION_PROVIDERS.GOOGLE_DRIVE: {
          const redirectUri = `${baseUrl}/api/integrations/google_drive/callback`;
          const state = googleDrive.encodeOAuthState(TEMP_ORG_ID, userId);
          authUrl = googleDrive.getGoogleAuthUrl(redirectUri, state);
          break;
        }
        case INTEGRATION_PROVIDERS.DROPBOX: {
          const redirectUri = `${baseUrl}/api/integrations/dropbox/callback`;
          const state = dropbox.encodeOAuthState(TEMP_ORG_ID, userId);
          authUrl = dropbox.getDropboxAuthUrl(redirectUri, state);
          break;
        }
        case INTEGRATION_PROVIDERS.ONEDRIVE: {
          const redirectUri = `${baseUrl}/api/integrations/onedrive/callback`;
          const state = onedrive.encodeOAuthState(TEMP_ORG_ID, userId);
          authUrl = onedrive.getOneDriveAuthUrl(redirectUri, state);
          break;
        }
        default:
          return res.status(400).json({ message: `Provider ${provider} not supported` });
      }

      await integrationStorage.logAuditEvent({
        orgId: TEMP_ORG_ID,
        provider,
        actionType: AUDIT_ACTION_TYPES.CONNECT,
        userId,
        details: "OAuth flow initiated",
      });

      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/google_drive/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`/settings/integrations?error=${encodeURIComponent(error as string)}`);
      }

      if (!code || !state) {
        return res.redirect("/settings/integrations?error=missing_params");
      }

      const decodedState = googleDrive.decodeOAuthState(state as string);
      if (!decodedState) {
        return res.redirect("/settings/integrations?error=invalid_state");
      }

      const { orgId, userId } = decodedState;

      const baseUrl = getOAuthBaseUrl(req.get("host") || "");
      const redirectUri = `${baseUrl}/api/integrations/google_drive/callback`;

      const tokens = await googleDrive.exchangeCodeForTokens(code as string, redirectUri);
      const userInfo = await googleDrive.getUserInfo(tokens.accessToken);

      await integrationStorage.upsertIntegration({
        orgId,
        provider: INTEGRATION_PROVIDERS.GOOGLE_DRIVE,
        status: INTEGRATION_STATUS.CONNECTED,
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        connectedByUserId: userId,
      });

      await integrationStorage.logAuditEvent({
        orgId,
        provider: INTEGRATION_PROVIDERS.GOOGLE_DRIVE,
        actionType: AUDIT_ACTION_TYPES.CONNECT,
        userId,
        details: `Connected as ${userInfo.email}`,
      });

      res.redirect("/settings/integrations?success=google_drive_connected");
    } catch (error: any) {
      console.error("Google OAuth callback error:", error);
      res.redirect(`/settings/integrations?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/api/integrations/dropbox/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`/settings/integrations?error=${encodeURIComponent(error as string)}`);
      }

      if (!code || !state) {
        return res.redirect("/settings/integrations?error=missing_params");
      }

      const decodedState = dropbox.decodeOAuthState(state as string);
      if (!decodedState) {
        return res.redirect("/settings/integrations?error=invalid_state");
      }

      const { orgId, userId } = decodedState;

      const baseUrl = getOAuthBaseUrl(req.get("host") || "");
      const redirectUri = `${baseUrl}/api/integrations/dropbox/callback`;

      const tokens = await dropbox.exchangeCodeForTokens(code as string, redirectUri);
      const userInfo = await dropbox.getUserInfo(tokens.accessToken);

      await integrationStorage.upsertIntegration({
        orgId,
        provider: INTEGRATION_PROVIDERS.DROPBOX,
        status: INTEGRATION_STATUS.CONNECTED,
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        connectedByUserId: userId,
      });

      await integrationStorage.logAuditEvent({
        orgId,
        provider: INTEGRATION_PROVIDERS.DROPBOX,
        actionType: AUDIT_ACTION_TYPES.CONNECT,
        userId,
        details: `Connected as ${userInfo.email}`,
      });

      res.redirect("/settings/integrations?success=dropbox_connected");
    } catch (error: any) {
      console.error("Dropbox OAuth callback error:", error);
      res.redirect(`/settings/integrations?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/api/integrations/onedrive/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`/settings/integrations?error=${encodeURIComponent(error as string)}`);
      }

      if (!code || !state) {
        return res.redirect("/settings/integrations?error=missing_params");
      }

      const decodedState = onedrive.decodeOAuthState(state as string);
      if (!decodedState) {
        return res.redirect("/settings/integrations?error=invalid_state");
      }

      const { orgId, userId } = decodedState;

      const baseUrl = getOAuthBaseUrl(req.get("host") || "");
      const redirectUri = `${baseUrl}/api/integrations/onedrive/callback`;

      const tokens = await onedrive.exchangeCodeForTokens(code as string, redirectUri);
      const userInfo = await onedrive.getUserInfo(tokens.accessToken);

      await integrationStorage.upsertIntegration({
        orgId,
        provider: INTEGRATION_PROVIDERS.ONEDRIVE,
        status: INTEGRATION_STATUS.CONNECTED,
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        connectedByUserId: userId,
      });

      await integrationStorage.logAuditEvent({
        orgId,
        provider: INTEGRATION_PROVIDERS.ONEDRIVE,
        actionType: AUDIT_ACTION_TYPES.CONNECT,
        userId,
        details: `Connected as ${userInfo.email}`,
      });

      res.redirect("/settings/integrations?success=onedrive_connected");
    } catch (error: any) {
      console.error("OneDrive OAuth callback error:", error);
      res.redirect(`/settings/integrations?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.post("/api/integrations/:provider/folder", requireAdmin, async (req, res) => {
    try {
      const provider = req.params.provider;
      const userId = getCurrentUserId(req);
      const { folderId: rawFolderId } = req.body;

      if (!rawFolderId) {
        return res.status(400).json({ message: "Folder ID or path required" });
      }

      const integration = await integrationStorage.getIntegration(TEMP_ORG_ID, provider);
      if (!integration || integration.status === INTEGRATION_STATUS.DISCONNECTED) {
        return res.status(400).json({ message: "Integration not connected" });
      }

      const accessToken = await integrationStorage.getDecryptedAccessToken(TEMP_ORG_ID, provider);
      if (!accessToken) {
        return res.status(400).json({ message: "Unable to access tokens" });
      }

      let folderId: string;
      let folderPath: string;
      let folderDisplayPath: string;

      switch (provider) {
        case INTEGRATION_PROVIDERS.GOOGLE_DRIVE: {
          folderId = googleDrive.parseFolderIdFromUrl(rawFolderId);
          const validation = await googleDrive.validateFolderAccess(accessToken, folderId);
          if (!validation.valid) {
            return res.status(400).json({ message: validation.error });
          }
          const folderInfo = await googleDrive.getFolderInfo(accessToken, folderId);
          if (!folderInfo) {
            return res.status(400).json({ message: "Could not get folder information" });
          }
          folderPath = folderInfo.path;
          folderDisplayPath = folderInfo.path;
          break;
        }
        case INTEGRATION_PROVIDERS.DROPBOX: {
          folderPath = dropbox.parseFolderPath(rawFolderId);
          const validation = await dropbox.validateFolderAccess(accessToken, folderPath);
          if (!validation.valid) {
            return res.status(400).json({ message: validation.error });
          }
          const folderInfo = await dropbox.getFolderInfo(accessToken, folderPath);
          folderId = folderInfo?.id || folderPath;
          folderDisplayPath = folderPath;
          break;
        }
        case INTEGRATION_PROVIDERS.ONEDRIVE: {
          folderPath = onedrive.parseFolderPath(rawFolderId);
          const validation = await onedrive.validateFolderAccess(accessToken, folderPath);
          if (!validation.valid) {
            return res.status(400).json({ message: validation.error });
          }
          folderId = validation.folderId || folderPath;
          folderDisplayPath = folderPath;
          break;
        }
        default:
          return res.status(400).json({ message: `Provider ${provider} not supported` });
      }

      await integrationStorage.updateIntegrationFolder(
        TEMP_ORG_ID,
        provider,
        folderId,
        folderPath,
        folderDisplayPath
      );

      await integrationStorage.logAuditEvent({
        orgId: TEMP_ORG_ID,
        provider,
        actionType: AUDIT_ACTION_TYPES.FOLDER_CHANGE,
        userId: userId || undefined,
        details: `Folder set to: ${folderDisplayPath}`,
      });

      res.json({ 
        success: true, 
        folder: {
          id: folderId,
          path: folderDisplayPath,
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/:provider/test-upload", requireAdmin, async (req, res) => {
    try {
      const provider = req.params.provider;
      const userId = getCurrentUserId(req);

      const integration = await integrationStorage.getIntegration(TEMP_ORG_ID, provider);
      if (!integration || integration.status === INTEGRATION_STATUS.DISCONNECTED) {
        return res.status(400).json({ message: "Integration not connected" });
      }

      if (!integration.selectedFolderId && !integration.selectedFolderPath) {
        return res.status(400).json({ message: "No folder selected" });
      }

      const accessToken = await integrationStorage.getDecryptedAccessToken(TEMP_ORG_ID, provider);
      if (!accessToken) {
        return res.status(400).json({ message: "Unable to access tokens" });
      }

      const testContent = `FieldScope Test Upload
======================
Timestamp: ${new Date().toISOString()}
Provider: ${provider}

This file was created to verify that FieldScope can upload files to your selected folder.
You can safely delete this file.
`;

      switch (provider) {
        case INTEGRATION_PROVIDERS.GOOGLE_DRIVE:
          await googleDrive.uploadFile(
            accessToken,
            "fieldscope_test_upload.txt",
            testContent,
            "text/plain",
            integration.selectedFolderId!
          );
          break;
        case INTEGRATION_PROVIDERS.DROPBOX:
          await dropbox.uploadFile(
            accessToken,
            "fieldscope_test_upload.txt",
            testContent,
            integration.selectedFolderPath!
          );
          break;
        case INTEGRATION_PROVIDERS.ONEDRIVE:
          await onedrive.uploadFile(
            accessToken,
            "fieldscope_test_upload.txt",
            testContent,
            integration.selectedFolderId!
          );
          break;
        default:
          return res.status(400).json({ message: `Provider ${provider} not supported` });
      }

      await integrationStorage.updateIntegrationStatus(TEMP_ORG_ID, provider, INTEGRATION_STATUS.READY);

      await integrationStorage.logAuditEvent({
        orgId: TEMP_ORG_ID,
        provider,
        actionType: AUDIT_ACTION_TYPES.TEST_UPLOAD,
        userId: userId || undefined,
        details: "Test upload successful",
      });

      res.json({ success: true, message: "Test file uploaded successfully" });
    } catch (error: any) {
      await integrationStorage.updateIntegrationStatus(
        TEMP_ORG_ID, 
        req.params.provider, 
        INTEGRATION_STATUS.ERROR,
        "TEST_UPLOAD_FAILED",
        error.message
      );

      await integrationStorage.logAuditEvent({
        orgId: TEMP_ORG_ID,
        provider: req.params.provider,
        actionType: AUDIT_ACTION_TYPES.TEST_UPLOAD,
        userId: getCurrentUserId(req) || undefined,
        errorMessage: error.message,
      });

      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/:provider/disconnect", requireAdmin, async (req, res) => {
    try {
      const provider = req.params.provider;
      const userId = getCurrentUserId(req);

      const accessToken = await integrationStorage.getDecryptedAccessToken(TEMP_ORG_ID, provider);
      
      let revocationFailed = false;
      if (accessToken) {
        let revoked = false;
        switch (provider) {
          case INTEGRATION_PROVIDERS.GOOGLE_DRIVE:
            revoked = await googleDrive.revokeToken(accessToken);
            break;
          case INTEGRATION_PROVIDERS.DROPBOX:
            revoked = await dropbox.revokeToken(accessToken);
            break;
          case INTEGRATION_PROVIDERS.ONEDRIVE:
            revoked = await onedrive.revokeToken(accessToken);
            break;
        }
        if (!revoked) {
          revocationFailed = true;
          console.warn(`Token revocation failed for ${provider}, proceeding with local disconnect`);
        }
      }

      await integrationStorage.disconnectIntegration(TEMP_ORG_ID, provider);

      await integrationStorage.logAuditEvent({
        orgId: TEMP_ORG_ID,
        provider,
        actionType: AUDIT_ACTION_TYPES.DISCONNECT,
        userId: userId || undefined,
        details: revocationFailed 
          ? "Disconnected (token revocation failed, tokens removed locally)"
          : "Disconnected successfully",
      });

      res.json({ 
        success: true,
        warning: revocationFailed 
          ? "Token revocation failed; tokens removed locally only" 
          : undefined,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/audit-log", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const log = await integrationStorage.getAuditLog(TEMP_ORG_ID, 100);
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/sync-jobs/:exportSessionId", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const exportSessionId = parseInt(req.params.exportSessionId, 10);
      if (isNaN(exportSessionId)) {
        return res.status(400).json({ message: "Invalid export session ID" });
      }

      const jobs = await integrationStorage.getSyncJobsForExport(exportSessionId);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/sync-export/:exportId", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const exportId = parseInt(req.params.exportId, 10);
      if (isNaN(exportId)) {
        return res.status(400).json({ message: "Invalid export ID" });
      }

      const readyIntegrations = await integrationStorage.getReadyIntegrations(TEMP_ORG_ID);
      if (readyIntegrations.length === 0) {
        return res.status(400).json({ 
          message: "No cloud storage integrations are configured and ready" 
        });
      }

      const results = await syncExportToCloud(TEMP_ORG_ID, exportId, userId);
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      res.json({
        success: failCount === 0,
        message: `Synced to ${successCount} provider(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
        results,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/ready", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const readyIntegrations = await integrationStorage.getReadyIntegrations(TEMP_ORG_ID);
      res.json(readyIntegrations.map(i => ({
        provider: i.provider,
        accountEmail: i.accountEmail,
        selectedFolderDisplayPath: i.selectedFolderDisplayPath,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
