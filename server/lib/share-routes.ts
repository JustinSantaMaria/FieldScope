import type { Express, Request, Response, NextFunction, Router } from "express";
import { Router as ExpressRouter } from "express";
import { storage } from "../storage";
import { ObjectStorageService, ObjectNotFoundError } from "../replit_integrations/object_storage/objectStorage";

export interface ShareContext {
  linkId: string;
  projectId: number;
  orgId: number;
  role: "contributor" | "viewer";
}

declare global {
  namespace Express {
    interface Request {
      shareContext?: ShareContext;
    }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function validateShareLink(linkId: string): Promise<{
  valid: boolean;
  error?: { code: string; message: string; status: number };
  context?: ShareContext;
}> {
  if (!linkId || !UUID_REGEX.test(linkId)) {
    return {
      valid: false,
      error: { code: "INVALID_LINK_ID", message: "Invalid share link format", status: 400 },
    };
  }
  
  let link;
  try {
    link = await storage.getGuestLink(linkId);
  } catch (err: any) {
    if (err?.code === "22P02") {
      return {
        valid: false,
        error: { code: "INVALID_LINK_ID", message: "Invalid share link format", status: 400 },
      };
    }
    throw err;
  }
  
  if (!link) {
    return {
      valid: false,
      error: { code: "NOT_FOUND", message: "This share link does not exist", status: 410 },
    };
  }
  
  if (link.revokedAt) {
    return {
      valid: false,
      error: { code: "REVOKED", message: "This share link has been revoked", status: 410 },
    };
  }
  
  if (link.expiresAt && link.expiresAt < new Date()) {
    return {
      valid: false,
      error: { code: "EXPIRED", message: "This share link has expired", status: 410 },
    };
  }
  
  const project = await storage.getProject(link.projectId);
  if (!project || project.deletedAt) {
    return {
      valid: false,
      error: { code: "PROJECT_NOT_FOUND", message: "The shared project no longer exists", status: 410 },
    };
  }
  
  return {
    valid: true,
    context: {
      linkId: link.id,
      projectId: link.projectId,
      orgId: link.organizationId,
      role: link.role as "contributor" | "viewer",
    },
  };
}

async function shareContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const linkId = req.params.linkId;
  
  if (!linkId) {
    return res.status(400).json({ code: "MISSING_LINK_ID", message: "Share link ID is required" });
  }
  
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  
  const result = await validateShareLink(linkId);
  
  if (!result.valid || !result.context) {
    console.log(`[ShareAPI] Invalid link ${linkId}: ${result.error?.code}`);
    return res.status(result.error?.status || 410).json({
      code: result.error?.code || "INVALID",
      message: result.error?.message || "Invalid share link",
    });
  }
  
  req.shareContext = result.context;
  next();
}

async function verifyResourceOwnership(
  shareContext: ShareContext,
  resourceType: "area" | "photo",
  resourceId: number
): Promise<boolean> {
  if (resourceType === "area") {
    const area = await storage.getArea(resourceId);
    if (!area || area.deletedAt) return false;
    return area.projectId === shareContext.projectId;
  }
  
  if (resourceType === "photo") {
    const photo = await storage.getPhoto(resourceId);
    if (!photo || photo.deletedAt) return false;
    const area = await storage.getArea(photo.areaId);
    if (!area || area.deletedAt) return false;
    return area.projectId === shareContext.projectId;
  }
  
  return false;
}

export function createShareApiRouter(): Router {
  const router = ExpressRouter({ mergeParams: true });
  
  router.use(shareContextMiddleware);
  
  router.get("/bootstrap", async (req, res) => {
    const ctx = req.shareContext!;
    const project = await storage.getProject(ctx.projectId);
    
    if (!project) {
      return res.status(410).json({ code: "PROJECT_NOT_FOUND", message: "Project not found" });
    }
    
    res.json({
      linkId: ctx.linkId,
      projectId: ctx.projectId,
      orgId: ctx.orgId,
      role: ctx.role,
      project: {
        id: project.id,
        clientName: project.clientName,
        siteName: project.siteName,
        address: project.address,
      },
    });
  });
  
  router.get("/project", async (req, res) => {
    const ctx = req.shareContext!;
    const project = await storage.getProject(ctx.projectId);
    
    if (!project) {
      return res.status(410).json({ code: "PROJECT_NOT_FOUND", message: "Project not found" });
    }
    
    res.json(project);
  });
  
  router.get("/areas", async (req, res) => {
    const ctx = req.shareContext!;
    const areas = await storage.getAreas(ctx.projectId);
    res.json(areas);
  });
  
  router.get("/areas/:areaId", async (req, res) => {
    const ctx = req.shareContext!;
    const areaId = parseInt(req.params.areaId, 10);
    
    if (isNaN(areaId)) {
      return res.status(400).json({ code: "INVALID_AREA_ID", message: "Invalid area ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "area", areaId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This area is not part of the shared project" });
    }
    
    const area = await storage.getArea(areaId);
    res.json(area);
  });
  
  router.get("/areas/:areaId/photos", async (req, res) => {
    const ctx = req.shareContext!;
    const areaId = parseInt(req.params.areaId, 10);
    
    if (isNaN(areaId)) {
      return res.status(400).json({ code: "INVALID_AREA_ID", message: "Invalid area ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "area", areaId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This area is not part of the shared project" });
    }
    
    const photos = await storage.getPhotos(areaId);
    res.json(photos);
  });
  
  router.post("/areas/:areaId/photos", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const areaId = parseInt(req.params.areaId, 10);
    
    if (isNaN(areaId)) {
      return res.status(400).json({ code: "INVALID_AREA_ID", message: "Invalid area ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "area", areaId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This area is not part of the shared project" });
    }
    
    try {
      let photoData = { ...req.body, areaId };
      
      const autoFilename = await storage.generatePhotoFilename(areaId, photoData.interiorExterior || "Exterior");
      photoData.filename = autoFilename;
      
      const urlForCanonical = photoData.originalUrl?.startsWith("/objects/") 
        ? photoData.originalUrl 
        : photoData.originalUrl?.startsWith("objects/") 
          ? "/" + photoData.originalUrl 
          : null;
          
      if (urlForCanonical) {
        try {
          const { canonicalizeImage } = await import("../photoExportService");
          const result = await canonicalizeImage(urlForCanonical);
          if (result) {
            console.log("[ShareAPI] Canonicalized image:", result.canonicalUrl);
            photoData = {
              ...photoData,
              originalUrl: photoData.originalUrl,
              canonicalUrl: result.canonicalUrl,
              canonicalFormat: result.canonicalFormat,
              canonicalWidth: result.canonicalWidth,
              canonicalHeight: result.canonicalHeight,
              originalFormat: result.originalFormat,
              originalExifOrientation: result.originalExifOrientation,
            };
          }
        } catch (canonErr) {
          console.error("[ShareAPI] Canonicalization failed, using original:", canonErr);
        }
      }
      
      const photo = await storage.createPhoto(photoData);
      res.status(201).json(photo);
    } catch (error) {
      console.error("[ShareAPI] Create photo error:", error);
      res.status(500).json({ code: "CREATE_FAILED", message: "Failed to create photo" });
    }
  });
  
  router.get("/photos/:photoId", async (req, res) => {
    const ctx = req.shareContext!;
    const photoId = parseInt(req.params.photoId, 10);
    
    if (isNaN(photoId)) {
      return res.status(400).json({ code: "INVALID_PHOTO_ID", message: "Invalid photo ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "photo", photoId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This photo is not part of the shared project" });
    }
    
    const photo = await storage.getPhoto(photoId);
    res.json(photo);
  });
  
  router.patch("/photos/:photoId", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const photoId = parseInt(req.params.photoId, 10);
    
    if (isNaN(photoId)) {
      return res.status(400).json({ code: "INVALID_PHOTO_ID", message: "Invalid photo ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "photo", photoId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This photo is not part of the shared project" });
    }
    
    try {
      const updated = await storage.updatePhoto(photoId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("[ShareAPI] Update photo error:", error);
      res.status(500).json({ code: "UPDATE_FAILED", message: "Failed to update photo" });
    }
  });
  
  router.delete("/photos/:photoId", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const photoId = parseInt(req.params.photoId, 10);
    
    if (isNaN(photoId)) {
      return res.status(400).json({ code: "INVALID_PHOTO_ID", message: "Invalid photo ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "photo", photoId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This photo is not part of the shared project" });
    }
    
    try {
      await storage.softDeletePhoto(photoId, "contributor");
      res.json({ success: true });
    } catch (error) {
      console.error("[ShareAPI] Delete photo error:", error);
      res.status(500).json({ code: "DELETE_FAILED", message: "Failed to delete photo" });
    }
  });
  
  router.post("/photos/:photoId/restore", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const photoId = parseInt(req.params.photoId, 10);
    
    if (isNaN(photoId)) {
      return res.status(400).json({ code: "INVALID_PHOTO_ID", message: "Invalid photo ID" });
    }
    
    try {
      await storage.restoreDeletedPhoto(photoId);
      const photo = await storage.getPhoto(photoId);
      res.json(photo);
    } catch (error) {
      console.error("[ShareAPI] Restore photo error:", error);
      res.status(500).json({ code: "RESTORE_FAILED", message: "Failed to restore photo" });
    }
  });
  
  router.post("/areas", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    try {
      const area = await storage.createArea({
        ...req.body,
        projectId: ctx.projectId,
      });
      res.status(201).json(area);
    } catch (error) {
      console.error("[ShareAPI] Create area error:", error);
      res.status(500).json({ code: "CREATE_FAILED", message: "Failed to create area" });
    }
  });
  
  router.patch("/areas/:areaId", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const areaId = parseInt(req.params.areaId, 10);
    
    if (isNaN(areaId)) {
      return res.status(400).json({ code: "INVALID_AREA_ID", message: "Invalid area ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "area", areaId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This area is not part of the shared project" });
    }
    
    try {
      const updated = await storage.updateArea(areaId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("[ShareAPI] Update area error:", error);
      res.status(500).json({ code: "UPDATE_FAILED", message: "Failed to update area" });
    }
  });
  
  router.delete("/areas/:areaId", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const areaId = parseInt(req.params.areaId, 10);
    
    if (isNaN(areaId)) {
      return res.status(400).json({ code: "INVALID_AREA_ID", message: "Invalid area ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "area", areaId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This area is not part of the shared project" });
    }
    
    try {
      await storage.softDeleteArea(areaId, "contributor");
      res.json({ success: true });
    } catch (error) {
      console.error("[ShareAPI] Delete area error:", error);
      res.status(500).json({ code: "DELETE_FAILED", message: "Failed to delete area" });
    }
  });
  
  router.post("/areas/:areaId/restore", async (req, res) => {
    const ctx = req.shareContext!;
    
    if (ctx.role !== "contributor") {
      return res.status(403).json({ code: "VIEW_ONLY", message: "You have view-only access" });
    }
    
    const areaId = parseInt(req.params.areaId, 10);
    
    if (isNaN(areaId)) {
      return res.status(400).json({ code: "INVALID_AREA_ID", message: "Invalid area ID" });
    }
    
    try {
      await storage.restoreDeletedArea(areaId);
      const area = await storage.getArea(areaId);
      res.json(area);
    } catch (error) {
      console.error("[ShareAPI] Restore area error:", error);
      res.status(500).json({ code: "RESTORE_FAILED", message: "Failed to restore area" });
    }
  });
  
  router.get("/photos/:photoId/image", async (req, res) => {
    const ctx = req.shareContext!;
    const photoId = parseInt(req.params.photoId, 10);
    
    if (isNaN(photoId)) {
      return res.status(400).json({ code: "INVALID_PHOTO_ID", message: "Invalid photo ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "photo", photoId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This photo is not part of the shared project" });
    }
    
    const photo = await storage.getPhoto(photoId);
    if (!photo) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Photo not found" });
    }
    
    const imageUrl = (photo as any).canonicalUrl || photo.originalUrl;
    if (!imageUrl) {
      return res.status(404).json({ code: "NO_IMAGE", message: "Photo has no image URL" });
    }
    
    try {
      const objectStorageService = new ObjectStorageService();
      
      let objectPath = imageUrl;
      if (objectPath.startsWith("/api/storage/public/")) {
        objectPath = objectPath.replace("/api/storage/public/", "");
      } else if (objectPath.startsWith("/api/storage/public")) {
        objectPath = objectPath.replace("/api/storage/public", "");
      }
      if (objectPath.startsWith("/")) {
        objectPath = objectPath.slice(1);
      }
      
      console.log(`[ShareAPI] Fetching image for photo ${photoId}:`, {
        originalUrl: photo.originalUrl,
        canonicalUrl: (photo as any).canonicalUrl,
        resolvedPath: objectPath,
      });
      
      const objectFile = await objectStorageService.getObjectEntityFile("/" + objectPath);
      
      console.log(`[ShareAPI] Serving image for photo ${photoId}`);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      
      await objectStorageService.downloadObject(objectFile, res, 0);
    } catch (error) {
      console.error("[ShareAPI] Image fetch error:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ code: "IMAGE_NOT_FOUND", message: "Image file not found" });
      }
      return res.status(500).json({ code: "IMAGE_ERROR", message: "Failed to fetch image" });
    }
  });
  
  router.get("/photos/:photoId/thumbnail", async (req, res) => {
    const ctx = req.shareContext!;
    const photoId = parseInt(req.params.photoId, 10);
    
    if (isNaN(photoId)) {
      return res.status(400).json({ code: "INVALID_PHOTO_ID", message: "Invalid photo ID" });
    }
    
    const isOwned = await verifyResourceOwnership(ctx, "photo", photoId);
    if (!isOwned) {
      return res.status(403).json({ code: "ACCESS_DENIED", message: "This photo is not part of the shared project" });
    }
    
    const photo = await storage.getPhoto(photoId);
    if (!photo) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Photo not found" });
    }
    
    const imageUrl = (photo as any).canonicalUrl || photo.originalUrl;
    if (!imageUrl) {
      return res.status(404).json({ code: "NO_IMAGE", message: "Photo has no image URL" });
    }
    
    try {
      const objectStorageService = new ObjectStorageService();
      
      let objectPath = imageUrl;
      if (objectPath.startsWith("/api/storage/public/")) {
        objectPath = objectPath.replace("/api/storage/public/", "");
      } else if (objectPath.startsWith("/api/storage/public")) {
        objectPath = objectPath.replace("/api/storage/public", "");
      }
      if (objectPath.startsWith("/")) {
        objectPath = objectPath.slice(1);
      }
      
      console.log(`[ShareAPI] Fetching thumbnail for photo ${photoId}, path: ${objectPath}`);
      
      const objectFile = await objectStorageService.getObjectEntityFile("/" + objectPath);
      
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      
      await objectStorageService.downloadObject(objectFile, res, 0);
    } catch (error) {
      console.error("[ShareAPI] Thumbnail fetch error:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ code: "IMAGE_NOT_FOUND", message: "Image file not found" });
      }
      return res.status(500).json({ code: "IMAGE_ERROR", message: "Failed to fetch thumbnail" });
    }
  });
  
  return router;
}

export function validateSharePathMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
}
