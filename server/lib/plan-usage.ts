import { db } from "../db";
import { 
  organizations, photos, exportEvents, guestProjectLinks,
  PLAN_CAPS, type PlanTier, type ExportEventType, isExportTypeAllowed
} from "@shared/schema";
import { sql, eq, and, isNull, gte } from "drizzle-orm";
import { getEffectiveLimits as getEntitlementLimits } from "../entitlements";

export interface UsageStats {
  storageUsedBytes: number;
  storageCapBytes: number;
  storagePercent: number;
  exportsThisMonth: number;
  exportsCapMonthly: number;
  exportsPercent: number;
  activeGuestLinks: number;
  guestLinksCap: number;
  guestLinksPercent: number;
}

export interface PlanEnforcement {
  canExport: boolean;
  canCreateGuestLink: boolean;
  canUpload: boolean;
  blockedReason?: string;
  allowedExportTypes: readonly string[];
}

async function getOrCreateOrg() {
  const [existingOrg] = await db.select().from(organizations).limit(1);
  if (existingOrg) return existingOrg;
  const [newOrg] = await db.insert(organizations).values({ name: "My Organization" }).returning();
  return newOrg;
}

export async function getOrgUsageStorageBytes(): Promise<number> {
  const result = await db.select({
    total: sql<string>`COALESCE(SUM(${photos.sizeBytes}), 0)`
  }).from(photos).where(isNull(photos.deletedAt));
  
  return parseInt(result[0]?.total || "0", 10);
}

export async function getOrgUsageMonthlyExports(organizationId: number): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const result = await db.select({
    count: sql<string>`COUNT(*)`
  }).from(exportEvents).where(
    and(
      eq(exportEvents.organizationId, organizationId),
      gte(exportEvents.createdAt, startOfMonth)
    )
  );
  
  return parseInt(result[0]?.count || "0", 10);
}

export async function getOrgUsageActiveGuestLinks(organizationId: number): Promise<number> {
  const now = new Date();
  
  const result = await db.select({
    count: sql<string>`COUNT(*)`
  }).from(guestProjectLinks).where(
    and(
      eq(guestProjectLinks.organizationId, organizationId),
      isNull(guestProjectLinks.revokedAt),
      sql`(${guestProjectLinks.expiresAt} IS NULL OR ${guestProjectLinks.expiresAt} > ${now})`
    )
  );
  
  return parseInt(result[0]?.count || "0", 10);
}

export async function getUsageStats(): Promise<UsageStats> {
  const org = await getOrCreateOrg();
  
  const effectiveLimits = await getEntitlementLimits(org.id);
  
  const [storageUsed, exportsThisMonth, activeGuestLinks] = await Promise.all([
    getOrgUsageStorageBytes(),
    getOrgUsageMonthlyExports(org.id),
    getOrgUsageActiveGuestLinks(org.id)
  ]);
  
  return {
    storageUsedBytes: storageUsed,
    storageCapBytes: effectiveLimits.storageBytes,
    storagePercent: Math.min(100, Math.round((storageUsed / effectiveLimits.storageBytes) * 100)),
    exportsThisMonth,
    exportsCapMonthly: effectiveLimits.monthlyExports,
    exportsPercent: Math.min(100, Math.round((exportsThisMonth / effectiveLimits.monthlyExports) * 100)),
    activeGuestLinks,
    guestLinksCap: effectiveLimits.activeGuestLinks,
    guestLinksPercent: effectiveLimits.activeGuestLinks >= 999999 
      ? 0 
      : Math.min(100, Math.round((activeGuestLinks / effectiveLimits.activeGuestLinks) * 100)),
  };
}

export async function checkPlanEnforcement(exportType?: ExportEventType): Promise<PlanEnforcement> {
  const org = await getOrCreateOrg();
  const plan = (org.plan || "starter") as PlanTier;
  const effectiveLimits = await getEntitlementLimits(org.id);
  const stats = await getUsageStats();
  
  const enforcement: PlanEnforcement = {
    canExport: true,
    canCreateGuestLink: true,
    canUpload: true,
    allowedExportTypes: effectiveLimits.allowedExportTypes,
  };
  
  if (stats.exportsThisMonth >= effectiveLimits.monthlyExports) {
    enforcement.canExport = false;
    enforcement.blockedReason = `Monthly export limit reached (${effectiveLimits.monthlyExports} exports). Add the Extra Exports add-on for more.`;
  }
  
  if (exportType && !isExportTypeAllowed(plan, exportType)) {
    enforcement.canExport = false;
    enforcement.blockedReason = `${exportType.toUpperCase()} exports are not available on the ${plan} plan. Upgrade to Pro or Business for PDF and Excel exports.`;
  }
  
  if (stats.activeGuestLinks >= effectiveLimits.activeGuestLinks) {
    enforcement.canCreateGuestLink = false;
    enforcement.blockedReason = effectiveLimits.activeGuestLinks >= 999999
      ? `Guest link limit reached. Contact support.`
      : `Guest link limit reached (${effectiveLimits.activeGuestLinks} active). Add Guest Links add-on for more.`;
  }
  
  if (stats.storageUsedBytes >= effectiveLimits.storageBytes) {
    enforcement.canUpload = false;
    enforcement.blockedReason = `Storage limit reached. Add Extra Storage add-on for more space.`;
  }
  
  return enforcement;
}

export async function recordExportEvent(
  organizationId: number,
  projectId: number,
  type: ExportEventType,
  userId?: string
): Promise<void> {
  await db.insert(exportEvents).values({
    organizationId,
    projectId,
    type,
    userId: userId || null,
  });
}

export async function getPlanInfo() {
  const org = await getOrCreateOrg();
  const plan = (org.plan || "starter") as PlanTier;
  const baseCaps = PLAN_CAPS[plan];
  const effectiveLimits = await getEntitlementLimits(org.id);
  const stats = await getUsageStats();
  
  return {
    organizationId: org.id,
    plan,
    baseCaps,
    effectiveLimits,
    usage: stats,
    branding: {
      type: effectiveLimits.branding,
      businessName: org.brandingBusinessName,
      phone: org.brandingPhone,
      email: org.brandingEmail,
      website: org.brandingWebsite,
      address: org.brandingAddress,
      logoUrl: org.brandingLogoUrl,
    }
  };
}
