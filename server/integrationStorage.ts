import { db } from "./db";
import { 
  orgIntegrations, 
  integrationAuditLog,
  exportSyncJobs,
  OrgIntegration,
  InsertOrgIntegration,
  IntegrationAuditLogEntry,
  InsertIntegrationAuditLog,
  ExportSyncJob,
  InsertExportSyncJob,
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATUS,
  AUDIT_ACTION_TYPES,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { encryptToken, decryptToken } from "./lib/tokenEncryption";

export class IntegrationStorage {
  async getIntegrationsByOrg(orgId: number): Promise<OrgIntegration[]> {
    return db
      .select()
      .from(orgIntegrations)
      .where(eq(orgIntegrations.orgId, orgId));
  }

  async getIntegration(orgId: number, provider: string): Promise<OrgIntegration | null> {
    const results = await db
      .select()
      .from(orgIntegrations)
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, provider)
      ));
    return results[0] || null;
  }

  async upsertIntegration(data: {
    orgId: number;
    provider: string;
    status: string;
    accountEmail?: string;
    accountName?: string;
    accessToken?: string;
    refreshToken?: string | null;
    tokenExpiresAt?: Date;
    scopes?: string;
    connectedByUserId?: string;
  }): Promise<OrgIntegration> {
    const existing = await this.getIntegration(data.orgId, data.provider);

    const updateData: Record<string, any> = {
      status: data.status,
      accountEmail: data.accountEmail,
      accountName: data.accountName,
      scopes: data.scopes,
      connectedByUserId: data.connectedByUserId,
      connectedAt: new Date(),
      updatedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    };

    if (data.accessToken) {
      updateData.accessTokenEncrypted = encryptToken(data.accessToken);
    }
    if (data.refreshToken) {
      updateData.refreshTokenEncrypted = encryptToken(data.refreshToken);
    }
    if (data.tokenExpiresAt) {
      updateData.tokenExpiresAt = data.tokenExpiresAt;
    }

    if (existing) {
      const [updated] = await db
        .update(orgIntegrations)
        .set(updateData)
        .where(eq(orgIntegrations.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(orgIntegrations)
        .values({
          orgId: data.orgId,
          provider: data.provider,
          ...updateData,
        })
        .returning();
      return created;
    }
  }

  async updateIntegrationFolder(
    orgId: number,
    provider: string,
    folderId: string,
    folderPath: string,
    folderDisplayPath: string
  ): Promise<OrgIntegration | null> {
    const [updated] = await db
      .update(orgIntegrations)
      .set({
        selectedFolderId: folderId,
        selectedFolderPath: folderPath,
        selectedFolderDisplayPath: folderDisplayPath,
        updatedAt: new Date(),
      })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, provider)
      ))
      .returning();
    return updated || null;
  }

  async updateIntegration(
    integrationId: number,
    updates: Partial<{
      status: string;
      accessTokenEncrypted: string;
      refreshTokenEncrypted: string;
      tokenExpiresAt: Date;
      lastSyncAt: Date;
      errorCode: string | null;
      errorMessage: string | null;
    }>
  ): Promise<OrgIntegration | null> {
    const [updated] = await db
      .update(orgIntegrations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(orgIntegrations.id, integrationId))
      .returning();
    return updated || null;
  }

  async updateIntegrationStatus(
    orgId: number,
    provider: string,
    status: string,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await db
      .update(orgIntegrations)
      .set({
        status,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, provider)
      ));
  }

  async updateLastSync(orgId: number, provider: string): Promise<void> {
    await db
      .update(orgIntegrations)
      .set({
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, provider)
      ));
  }

  async disconnectIntegration(orgId: number, provider: string): Promise<void> {
    await db
      .update(orgIntegrations)
      .set({
        status: INTEGRATION_STATUS.DISCONNECTED,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        scopes: null,
        selectedFolderId: null,
        selectedFolderPath: null,
        selectedFolderDisplayPath: null,
        connectedByUserId: null,
        connectedAt: null,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, provider)
      ));
  }

  async getDecryptedAccessToken(orgId: number, provider: string): Promise<string | null> {
    const integration = await this.getIntegration(orgId, provider);
    if (!integration?.accessTokenEncrypted) return null;
    
    try {
      return decryptToken(integration.accessTokenEncrypted);
    } catch {
      return null;
    }
  }

  async updateAccessToken(
    orgId: number,
    provider: string,
    accessToken: string,
    expiresAt: Date
  ): Promise<void> {
    await db
      .update(orgIntegrations)
      .set({
        accessTokenEncrypted: encryptToken(accessToken),
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(and(
        eq(orgIntegrations.orgId, orgId),
        eq(orgIntegrations.provider, provider)
      ));
  }

  async logAuditEvent(data: InsertIntegrationAuditLog): Promise<IntegrationAuditLogEntry> {
    const [entry] = await db
      .insert(integrationAuditLog)
      .values(data)
      .returning();
    return entry;
  }

  async getAuditLog(orgId: number, limit: number = 50): Promise<IntegrationAuditLogEntry[]> {
    return db
      .select()
      .from(integrationAuditLog)
      .where(eq(integrationAuditLog.orgId, orgId))
      .orderBy(desc(integrationAuditLog.createdAt))
      .limit(limit);
  }

  async createSyncJob(data: InsertExportSyncJob): Promise<ExportSyncJob> {
    const [job] = await db
      .insert(exportSyncJobs)
      .values(data)
      .returning();
    return job;
  }

  async updateSyncJob(
    jobId: number,
    updates: Partial<{
      status: string;
      progress: number;
      uploadedFiles: number;
      startedAt: Date;
      completedAt: Date;
      errorMessage: string;
    }>
  ): Promise<ExportSyncJob | null> {
    const [updated] = await db
      .update(exportSyncJobs)
      .set(updates)
      .where(eq(exportSyncJobs.id, jobId))
      .returning();
    return updated || null;
  }

  async getSyncJob(jobId: number): Promise<ExportSyncJob | null> {
    const results = await db
      .select()
      .from(exportSyncJobs)
      .where(eq(exportSyncJobs.id, jobId));
    return results[0] || null;
  }

  async getSyncJobsForExport(exportSessionId: number): Promise<ExportSyncJob[]> {
    return db
      .select()
      .from(exportSyncJobs)
      .where(eq(exportSyncJobs.exportSessionId, exportSessionId))
      .orderBy(desc(exportSyncJobs.createdAt));
  }
}

export const integrationStorage = new IntegrationStorage();
