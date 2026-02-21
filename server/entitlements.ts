import { db } from "./db";
import { 
  organizations, 
  organizationEntitlements, 
  addonAuditLog,
  PLAN_CAPS,
  ADDON_SKUS,
  type PlanTier,
  type EffectiveLimits,
  type GuestLinksMode,
  type StorageTier,
  type ExportsTier,
  type BrandingType,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface EntitlementState {
  guestLinksMode: GuestLinksMode;
  guestLinksQty: number;
  storageTier: StorageTier;
  exportsTier: ExportsTier;
  isActive: boolean;
}

export async function getOrCreateEntitlements(organizationId: number): Promise<EntitlementState> {
  const existing = await db
    .select()
    .from(organizationEntitlements)
    .where(eq(organizationEntitlements.organizationId, organizationId))
    .limit(1);
  
  if (existing.length > 0) {
    const ent = existing[0];
    return {
      guestLinksMode: ent.guestLinksMode as GuestLinksMode,
      guestLinksQty: ent.guestLinksQty,
      storageTier: ent.storageTier as StorageTier,
      exportsTier: ent.exportsTier as ExportsTier,
      isActive: ent.isActive,
    };
  }
  
  await db.insert(organizationEntitlements).values({
    organizationId,
    guestLinksMode: "none",
    guestLinksQty: 0,
    storageTier: "none",
    exportsTier: "none",
    isActive: false,
  });
  
  return {
    guestLinksMode: "none",
    guestLinksQty: 0,
    storageTier: "none",
    exportsTier: "none",
    isActive: false,
  };
}

export async function updateEntitlements(
  organizationId: number,
  updates: Partial<EntitlementState>,
  actorUserId?: string
): Promise<EntitlementState> {
  await getOrCreateEntitlements(organizationId);
  
  const current = await db
    .select()
    .from(organizationEntitlements)
    .where(eq(organizationEntitlements.organizationId, organizationId))
    .limit(1);
  
  const beforeState = current[0] ? {
    guestLinksMode: current[0].guestLinksMode,
    guestLinksQty: current[0].guestLinksQty,
    storageTier: current[0].storageTier,
    exportsTier: current[0].exportsTier,
    isActive: current[0].isActive,
  } : null;
  
  await db
    .update(organizationEntitlements)
    .set({
      ...updates,
      updatedAt: new Date(),
      updatedByUserId: actorUserId,
    })
    .where(eq(organizationEntitlements.organizationId, organizationId));
  
  const updated = await db
    .select()
    .from(organizationEntitlements)
    .where(eq(organizationEntitlements.organizationId, organizationId))
    .limit(1);
  
  const afterState = {
    guestLinksMode: updated[0].guestLinksMode as GuestLinksMode,
    guestLinksQty: updated[0].guestLinksQty,
    storageTier: updated[0].storageTier as StorageTier,
    exportsTier: updated[0].exportsTier as ExportsTier,
    isActive: updated[0].isActive,
  };
  
  await db.insert(addonAuditLog).values({
    organizationId,
    actorUserId,
    action: "entitlements_updated",
    beforeState,
    afterState,
  });
  
  return afterState;
}

export async function logAddonAction(
  organizationId: number,
  action: string,
  actorUserId?: string,
  beforeState?: any,
  afterState?: any,
  metadata?: any
): Promise<void> {
  await db.insert(addonAuditLog).values({
    organizationId,
    actorUserId,
    action,
    beforeState,
    afterState,
    metadata,
  });
}

export async function getEffectiveLimits(organizationId: number): Promise<EffectiveLimits> {
  const org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  
  if (!org.length) {
    throw new Error(`Organization ${organizationId} not found`);
  }
  
  const plan = (org[0].plan || "starter") as PlanTier;
  const baseCaps = PLAN_CAPS[plan] || PLAN_CAPS.starter;
  
  const entitlements = await getOrCreateEntitlements(organizationId);
  
  let storageBytes: number = baseCaps.storageBytes;
  let monthlyExports: number = baseCaps.monthlyExports;
  let activeGuestLinks: number = baseCaps.activeGuestLinks;
  
  if (entitlements.isActive) {
    if (entitlements.storageTier === "200gb") {
      storageBytes += ADDON_SKUS.STORAGE_200GB.storageBytes;
    } else if (entitlements.storageTier === "1tb") {
      storageBytes += ADDON_SKUS.STORAGE_1TB.storageBytes;
    }
    
    if (entitlements.exportsTier === "plus200") {
      monthlyExports += ADDON_SKUS.EXPORTS_PLUS_200.extraExports;
    }
    
    if (entitlements.guestLinksMode === "unlimited") {
      activeGuestLinks = 999999;
    } else if (entitlements.guestLinksMode === "per_link") {
      activeGuestLinks += entitlements.guestLinksQty;
    }
  }
  
  return {
    storageBytes,
    monthlyExports,
    activeGuestLinks,
    allowedExportTypes: baseCaps.allowedExportTypes,
    branding: baseCaps.branding as BrandingType,
    cloudSync: baseCaps.cloudSync,
    addons: entitlements,
  };
}

export function calculateAddonMonthlyCost(selection: {
  guestLinksMode: GuestLinksMode;
  guestLinksQty: number;
  storageTier: StorageTier;
  exportsTier: ExportsTier;
}): number {
  let total = 0;
  
  if (selection.guestLinksMode === "unlimited") {
    total += ADDON_SKUS.GUEST_LINKS_UNLIMITED.priceMonthly;
  } else if (selection.guestLinksMode === "per_link" && selection.guestLinksQty > 0) {
    total += ADDON_SKUS.GUEST_LINKS_PER_LINK.priceMonthly * selection.guestLinksQty;
  }
  
  if (selection.storageTier === "200gb") {
    total += ADDON_SKUS.STORAGE_200GB.priceMonthly;
  } else if (selection.storageTier === "1tb") {
    total += ADDON_SKUS.STORAGE_1TB.priceMonthly;
  }
  
  if (selection.exportsTier === "plus200") {
    total += ADDON_SKUS.EXPORTS_PLUS_200.priceMonthly;
  }
  
  return total;
}
