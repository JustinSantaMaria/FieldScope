import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { exportJobService } from "./services/exportJobService";

const RETENTION_KEEP_COUNT = 20;
const RETENTION_MAX_AGE_DAYS = 30;
const TEMP_DIR_ROOT = "/tmp/fieldscope";
const ORPHAN_TEMP_DIR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function runRetentionCleanup(): Promise<void> {
  console.log("[CLEANUP] Starting retention cleanup...");
  
  try {
    const objectStorageService = new ObjectStorageService();
    const projects = await storage.getProjects();
    
    let totalDeleted = 0;
    let totalStorageDeleted = 0;
    
    for (const project of projects) {
      const exportsToDelete = await storage.getExportsForRetentionCleanup(
        project.id,
        RETENTION_KEEP_COUNT,
        RETENTION_MAX_AGE_DAYS
      );
      
      for (const exp of exportsToDelete) {
        try {
          if (exp.fileUrl?.startsWith("/objects/")) {
            const deletedCount = await objectStorageService.deleteObjectsByPrefix(`exports/${exp.id}/`);
            totalStorageDeleted += deletedCount;
          }
          
          await storage.deleteExport(exp.id);
          totalDeleted++;
          console.log(`[CLEANUP] Deleted export ${exp.id} from project ${project.id}`);
        } catch (err) {
          console.error(`[CLEANUP] Failed to delete export ${exp.id}:`, err);
        }
      }
    }
    
    console.log(`[CLEANUP] Retention cleanup complete: ${totalDeleted} exports, ${totalStorageDeleted} storage objects deleted`);
  } catch (err) {
    console.error("[CLEANUP] Retention cleanup failed:", err);
  }
}

export async function cleanupOrphanedTempDirs(): Promise<void> {
  console.log("[CLEANUP] Checking for orphaned temp directories...");
  
  try {
    if (!fs.existsSync(TEMP_DIR_ROOT)) {
      console.log("[CLEANUP] No temp directory root exists, skipping");
      return;
    }
    
    const entries = fs.readdirSync(TEMP_DIR_ROOT, { withFileTypes: true });
    const now = Date.now();
    let cleaned = 0;
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const dirPath = path.join(TEMP_DIR_ROOT, entry.name);
      const stats = fs.statSync(dirPath);
      const ageMs = now - stats.mtimeMs;
      
      if (ageMs > ORPHAN_TEMP_DIR_MAX_AGE_MS) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          cleaned++;
          console.log(`[CLEANUP] Removed orphaned temp dir: ${entry.name} (age: ${Math.round(ageMs / 1000 / 60)} min)`);
        } catch (err) {
          console.error(`[CLEANUP] Failed to remove ${dirPath}:`, err);
        }
      }
    }
    
    console.log(`[CLEANUP] Orphaned temp cleanup complete: ${cleaned} directories removed`);
  } catch (err) {
    console.error("[CLEANUP] Orphaned temp cleanup failed:", err);
  }
}

async function cleanupStaleExportJobs(): Promise<void> {
  console.log("[CLEANUP] Starting export job cleanup...");
  try {
    const cleaned = await exportJobService.cleanupOldJobs(24);
    console.log(`[CLEANUP] Export job cleanup complete: ${cleaned} jobs cleaned`);
  } catch (err) {
    console.error("[CLEANUP] Export job cleanup failed:", err);
  }
}

export async function runAllCleanupTasks(): Promise<void> {
  await cleanupOrphanedTempDirs();
  await cleanupStaleExportJobs();
  await runRetentionCleanup();
}

export function scheduleCleanupJob(): void {
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  
  console.log("[CLEANUP] Running initial cleanup on startup...");
  runAllCleanupTasks().catch(err => {
    console.error("[CLEANUP] Initial cleanup failed:", err);
  });
  
  setInterval(() => {
    console.log("[CLEANUP] Running scheduled daily cleanup...");
    runAllCleanupTasks().catch(err => {
      console.error("[CLEANUP] Scheduled cleanup failed:", err);
    });
  }, CLEANUP_INTERVAL_MS);
  
  console.log("[CLEANUP] Cleanup job scheduled (runs every 24h)");
}
