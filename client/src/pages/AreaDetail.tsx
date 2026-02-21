import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LayoutShell } from "@/components/layout-shell";
import { ShareLayout } from "@/components/share-layout";
import { useShareContext } from "@/lib/share-context";
import { usePhotos, useCreatePhoto, useDeletePhoto, useRestoreDeletedPhoto, useBulkDeletePhotos } from "@/hooks/use-photos";
import { useArea, useDeleteArea, useRestoreDeletedArea } from "@/hooks/use-areas";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Camera, Loader2, Image as ImageIcon, MapPin, X, MoreVertical, Trash2, Pencil, CheckSquare, Download } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { PhotoUploadButton } from "@/components/photo-upload-button";
import { PhotoDropZone, type FileUploadStatus } from "@/components/photo-drop-zone";
import { compressImageIfNeeded, validateImageFile, MAX_BATCH_SIZE, correctImageOrientation, ensureCompatibleFormat } from "@/lib/imageCompression";
import { EditAreaDialog } from "@/components/edit-area-dialog";
import { saveToPhotoLibrary, getSaveToLibraryPreference, isNativeApp } from "@/lib/photoLibrarySave";
import { normalizeStorageUrl } from "@/lib/storageUrl";
import type { Area, Photo } from "@shared/schema";

const SURFACE_TYPE_OPTIONS = ["CMU", "Drywall", "Glass", "Metal", "Brick", "Wood", "Stucco", "Concrete", "Window", "Vinyl", "Painted Metal", "Composite Panel", "Concrete Block"];

function hasRealAnnotations(annotationData: unknown): boolean {
  if (!annotationData || typeof annotationData !== 'object') return false;
  const data = annotationData as { lines?: unknown[]; rects?: unknown[]; arrows?: unknown[]; texts?: unknown[]; dimensions?: unknown[] };
  return (
    (data.lines?.length ?? 0) > 0 ||
    (data.rects?.length ?? 0) > 0 ||
    (data.arrows?.length ?? 0) > 0 ||
    (data.texts?.length ?? 0) > 0 ||
    (data.dimensions?.length ?? 0) > 0
  );
}

export default function AreaDetail() {
  const [ownerMatch, ownerParams] = useRoute("/areas/:id");
  const [shareMatch, shareParams] = useRoute("/share/:linkId/area/:areaId");
  
  const shareContext = useShareContext();
  const isShareMode = !!shareContext;
  const linkId = shareContext?.linkId || shareParams?.linkId || "";
  const areaId = isShareMode 
    ? parseInt(shareParams?.areaId || "0")
    : parseInt(ownerParams?.id || "0");
  
  const shareHeaders: Record<string, string> = isShareMode ? { "X-Share-Link": linkId } : {};
  
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const ownerAreaQuery = useArea(isShareMode ? 0 : areaId);
  const { data: shareArea, isLoading: shareAreaLoading } = useQuery<Area>({
    queryKey: ["/api/share", linkId, "areas", areaId],
    queryFn: async () => {
      const res = await fetch(`/api/share/${linkId}/areas/${areaId}`, { headers: shareHeaders });
      if (!res.ok) throw new Error("Failed to fetch area");
      return res.json();
    },
    enabled: isShareMode && !!linkId && areaId > 0,
  });
  const area = isShareMode ? shareArea : ownerAreaQuery.data;
  
  const ownerPhotosQuery = usePhotos(isShareMode ? 0 : areaId);
  const { data: sharePhotos, isLoading: sharePhotosLoading } = useQuery<Photo[]>({
    queryKey: ["/api/share", linkId, "areas", areaId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/share/${linkId}/areas/${areaId}/photos`, { headers: shareHeaders });
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
    enabled: isShareMode && !!linkId && areaId > 0,
  });
  const photos = isShareMode ? sharePhotos : ownerPhotosQuery.data;
  const photosLoading = isShareMode ? sharePhotosLoading : ownerPhotosQuery.isLoading;
  
  const { mutate: ownerCreatePhoto, isPending: ownerCreating } = useCreatePhoto(areaId);
  const shareCreatePhotoMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/share/${linkId}/areas/${areaId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...shareHeaders },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create photo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId, "areas", areaId, "photos"] });
    },
  });
  const isCreating = isShareMode ? shareCreatePhotoMutation.isPending : ownerCreating;
  
  const createPhoto = (data: any, options?: { onSuccess?: (photo: Photo) => void; onError?: (error: Error) => void }) => {
    if (isShareMode) {
      shareCreatePhotoMutation.mutate(data, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    } else {
      ownerCreatePhoto(data, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    }
  };
  
  const { mutate: ownerDeleteArea, isPending: isDeleting } = useDeleteArea();
  const { mutate: ownerRestoreArea } = useRestoreDeletedArea();
  const { mutate: deletePhoto } = useDeletePhoto();
  const { mutate: restorePhoto } = useRestoreDeletedPhoto();
  
  const shareDeleteAreaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/share/${linkId}/areas/${areaId}`, {
        method: "DELETE",
        headers: shareHeaders,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete area");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId] });
    },
  });
  
  const shareRestoreAreaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/share/${linkId}/areas/${areaId}/restore`, {
        method: "POST",
        headers: shareHeaders,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to restore area");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId] });
    },
  });
  
  const deleteArea = isShareMode 
    ? (id: number, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
        shareDeleteAreaMutation.mutate(undefined, {
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      }
    : ownerDeleteArea;
    
  const restoreArea = isShareMode
    ? (id: number, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
        shareRestoreAreaMutation.mutate(undefined, {
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      }
    : ownerRestoreArea;
  const { mutate: bulkDeletePhotos, isPending: isBulkDeletingPhotos } = useBulkDeletePhotos();
  const { uploadFile, isUploading: isUploadingToStorage } = useUpload();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Photo selection and delete state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [deletePhotoId, setDeletePhotoId] = useState<number | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const photoUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const photoToDelete = photos?.find(p => p.id === deletePhotoId);

  const togglePhotoSelection = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newSet = new Set(selectedPhotos);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPhotos(newSet);
  };

  const handleDeletePhoto = (photoId: number, filename: string) => {
    deletePhoto(photoId, {
      onSuccess: () => {
        setDeletePhotoId(null);
        toast({
          title: "Photo deleted",
          description: `"${filename}" moved to trash`,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (photoUndoTimeoutRef.current) clearTimeout(photoUndoTimeoutRef.current);
                restorePhoto(photoId);
              }}
            >
              Undo
            </Button>
          ),
        });
        photoUndoTimeoutRef.current = setTimeout(() => {}, 10000);
      },
    });
  };

  const handleBulkDeletePhotos = () => {
    const ids = Array.from(selectedPhotos);
    bulkDeletePhotos(ids, {
      onSuccess: () => {
        setBulkDeleteDialogOpen(false);
        const count = ids.length;
        setSelectedPhotos(new Set());
        setSelectMode(false);
        toast({
          title: `${count} photo${count > 1 ? 's' : ''} deleted`,
          description: "Items moved to trash",
        });
      },
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedPhotos(new Set());
  };

  const handleDownloadSelected = async (variant: "clean" | "annotated") => {
    if (selectedPhotos.size === 0 || !area) return;
    
    setIsDownloading(true);
    try {
      const items = Array.from(selectedPhotos).map(photoId => ({
        photoId,
        variant,
      }));
      
      const response = await fetch(`/api/projects/${area.projectId}/export/photos-selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, quality: 95 }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Download failed");
      }
      
      // Download the ZIP file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "photos.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download complete",
        description: `${items.length} photo${items.length > 1 ? "s" : ""} downloaded`,
      });
      
      exitSelectMode();
    } catch (err) {
      console.error("Download failed:", err);
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Failed to download photos",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileUploadStatuses, setFileUploadStatuses] = useState<FileUploadStatus[]>([]);
  const [pendingGeo, setPendingGeo] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  
  const [interiorExterior, setInteriorExterior] = useState("");
  const [illuminated, setIlluminated] = useState("None");
  const [singleDoubleSided, setSingleDoubleSided] = useState("N/A");
  const [wallTypeTags, setWallTypeTags] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [customTagInput, setCustomTagInput] = useState("");

  const isUploading = isCreating || isUploadingToStorage || isBatchUploading;
  const currentFile = pendingFiles[currentFileIndex];

  const resetForm = () => {
    setInteriorExterior("");
    setIlluminated("None");
    setSingleDoubleSided("N/A");
    setWallTypeTags([]);
    setCustomTags([]);
    setNotes("");
    setCustomTagInput("");
    setPendingFiles([]);
    setCurrentFileIndex(0);
    setFileUploadStatuses([]);
    setPendingGeo({ lat: null, lng: null });
    setIsBatchUploading(false);
  };

  const handleFilesSelected = useCallback(async (files: File[], source?: "camera" | "library") => {
    if (files.length === 0) return;

    const limitedFiles = files.slice(0, MAX_BATCH_SIZE);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of limitedFiles) {
      const validation = validateImageFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    }

    if (errors.length > 0) {
      toast({
        title: "Some files skipped",
        description: errors.slice(0, 3).join(", ") + (errors.length > 3 ? ` and ${errors.length - 3} more` : ""),
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) return;

    // Native app only: auto-save to device Photos if enabled
    if (source === "camera" && isNativeApp() && getSaveToLibraryPreference()) {
      for (const file of validFiles) {
        try {
          const correctedFile = await correctImageOrientation(file);
          const result = await saveToPhotoLibrary(correctedFile);
          if (!result.success && result.error) {
            toast({
              title: "Saved to project",
              description: `Couldn't save to Photos: ${result.error}`,
            });
          }
        } catch (err) {
          console.log("Failed to save to photo library:", err);
        }
      }
    }

    let geoLat: number | null = null;
    let geoLng: number | null = null;

    if ("geolocation" in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 60000,
          });
        });
        geoLat = position.coords.latitude;
        geoLng = position.coords.longitude;
      } catch (geoError) {
        console.log("GPS not available:", geoError);
      }
    }

    setPendingFiles(validFiles);
    setCurrentFileIndex(0);
    setPendingGeo({ lat: geoLat, lng: geoLng });
    setFileUploadStatuses(validFiles.map(f => ({ file: f, status: 'pending' as const, progress: 0 })));
    setShowMetadataDialog(true);
  }, [toast]);

  const handleUploadWithMetadata = async () => {
    if (pendingFiles.length === 0) return;
    
    if (!interiorExterior) {
      toast({
        title: "Location Type required",
        description: "Please select a location type before uploading",
        variant: "destructive",
      });
      return;
    }

    setIsBatchUploading(true);
    let successCount = 0;
    let errorCount = 0;
    let lastCreatedPhotoId: number | null = null;

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      
      setFileUploadStatuses(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: 'uploading' as const, progress: 10 } : s
      ));

      try {
        const compatibleFile = await ensureCompatibleFormat(file);
        const compressed = await compressImageIfNeeded(compatibleFile);
        
        setFileUploadStatuses(prev => prev.map((s, idx) => 
          idx === i ? { ...s, progress: 40 } : s
        ));

        const compressedFile = new File([compressed.blob], file.name, { type: 'image/jpeg' });
        const uploadResult = await uploadFile(compressedFile);
        
        setFileUploadStatuses(prev => prev.map((s, idx) => 
          idx === i ? { ...s, progress: 70 } : s
        ));

        if (!uploadResult) {
          throw new Error("Upload failed");
        }

        const createdPhoto = await new Promise<{ id: number } | null>((resolve) => {
          createPhoto(
            {
              filename: file.name,
              originalUrl: uploadResult.objectPath,
              annotatedUrl: null,
              geoLat: pendingGeo.lat,
              geoLng: pendingGeo.lng,
              interiorExterior,
              illuminated,
              singleDoubleSided,
              wallTypeTags,
              customTags,
              notes,
              source: 'upload',
              sizeBytes: compressed.sizeBytes,
              width: compressed.width,
              height: compressed.height,
            },
            {
              onSuccess: (photo) => {
                setFileUploadStatuses(prev => prev.map((s, idx) => 
                  idx === i ? { ...s, status: 'success' as const, progress: 100 } : s
                ));
                successCount++;
                resolve(photo);
              },
              onError: (error) => {
                setFileUploadStatuses(prev => prev.map((s, idx) => 
                  idx === i ? { ...s, status: 'error' as const, error: error.message } : s
                ));
                errorCount++;
                resolve(null);
              },
            }
          );
        });
        
        if (createdPhoto) {
          lastCreatedPhotoId = createdPhoto.id;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";
        setFileUploadStatuses(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'error' as const, error: errorMessage } : s
        ));
        errorCount++;
      }
    }

    setIsBatchUploading(false);

    if (successCount > 0) {
      toast({
        title: `${successCount} photo${successCount > 1 ? 's' : ''} uploaded`,
        description: errorCount > 0 ? `${errorCount} failed` : undefined,
      });
    }
    
    if (errorCount === 0) {
      setShowMetadataDialog(false);
      resetForm();
      
      // Auto-navigate to annotation editor for the newly created photo
      if (lastCreatedPhotoId) {
        navigate(isShareMode ? `/share/${linkId}/photo/${lastCreatedPhotoId}` : `/photos/${lastCreatedPhotoId}`);
      }
    }
  };

  const handleQuickAddFiles = useCallback(async (files: File[], source?: "camera" | "library") => {
    if (files.length === 0 || !area) return;

    const limitedFiles = files.slice(0, MAX_BATCH_SIZE);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of limitedFiles) {
      const validation = validateImageFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    }

    if (errors.length > 0) {
      toast({
        title: "Some files skipped",
        description: errors.slice(0, 3).join(", ") + (errors.length > 3 ? ` and ${errors.length - 3} more` : ""),
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) return;

    // Native app only: auto-save to device Photos if enabled
    if (source === "camera" && isNativeApp() && getSaveToLibraryPreference()) {
      for (const file of validFiles) {
        try {
          const correctedFile = await correctImageOrientation(file);
          const result = await saveToPhotoLibrary(correctedFile);
          if (!result.success && result.error) {
            toast({
              title: "Saved to project",
              description: `Couldn't save to Photos: ${result.error}`,
            });
          }
        } catch (err) {
          console.log("Failed to save to photo library:", err);
        }
      }
    }

    let geoLat: number | null = null;
    let geoLng: number | null = null;

    if ("geolocation" in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 60000,
          });
        });
        geoLat = position.coords.latitude;
        geoLng = position.coords.longitude;
      } catch (geoError) {
        console.log("GPS not available:", geoError);
      }
    }

    // Use area's location type for quick add
    const quickAddLocationType = area.locationType || "Interior";
    
    setIsBatchUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      try {
        const compatibleFile = await ensureCompatibleFormat(file);
        const compressed = await compressImageIfNeeded(compatibleFile);
        const compressedFile = new File([compressed.blob], file.name, { type: 'image/jpeg' });
        const uploadResult = await uploadFile(compressedFile);

        if (!uploadResult) {
          throw new Error("Upload failed");
        }

        await new Promise<{ id: number } | null>((resolve) => {
          createPhoto(
            {
              filename: file.name,
              originalUrl: uploadResult.objectPath,
              annotatedUrl: null,
              geoLat,
              geoLng,
              interiorExterior: quickAddLocationType,
              illuminated: "None",
              singleDoubleSided: "N/A",
              wallTypeTags: [],
              customTags: [],
              notes: "",
              source: 'upload',
              sizeBytes: compressed.sizeBytes,
              width: compressed.width,
              height: compressed.height,
            },
            {
              onSuccess: (photo) => {
                successCount++;
                resolve(photo);
              },
              onError: (error) => {
                errorCount++;
                resolve(null);
              },
            }
          );
        });
      } catch (error) {
        errorCount++;
      }
    }

    setIsBatchUploading(false);

    if (successCount > 0) {
      toast({
        title: `${successCount} photo${successCount > 1 ? 's' : ''} added`,
        description: `Quick add complete${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
      });
    } else if (errorCount > 0) {
      toast({
        title: "Upload failed",
        description: `${errorCount} file${errorCount > 1 ? 's' : ''} could not be uploaded`,
        variant: "destructive",
      });
    }
  }, [area, toast, uploadFile, createPhoto]);

  const toggleWallType = (tag: string) => {
    setWallTypeTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const tag = customTagInput.trim();
    if (tag && !customTags.includes(tag)) {
      setCustomTags([...customTags, tag]);
      setCustomTagInput("");
    }
  };

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const handleDeleteArea = useCallback(() => {
    if (!area) return;
    
    const projectId = area.projectId;
    
    deleteArea(areaId, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        navigate(`/projects/${projectId}`);
        
        const { dismiss } = toast({
          title: "Area deleted",
          description: "The area and all its photos have been deleted. Click Undo to restore.",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (undoTimeoutRef.current) {
                  clearTimeout(undoTimeoutRef.current);
                  undoTimeoutRef.current = null;
                }
                restoreArea(areaId, {
                  onSuccess: () => {
                    toast({ title: "Area restored" });
                    navigate(`/areas/${areaId}`);
                  },
                  onError: () => {
                    toast({ 
                      title: "Restore failed", 
                      variant: "destructive" 
                    });
                  },
                });
                dismiss();
              }}
              data-testid="button-undo-delete-area"
            >
              Undo
            </Button>
          ),
          duration: 10000,
        });
        
        undoTimeoutRef.current = setTimeout(() => {
          dismiss();
          undoTimeoutRef.current = null;
        }, 10000);
      },
      onError: (error) => {
        toast({
          title: "Delete failed",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }, [area, areaId, deleteArea, restoreArea, navigate, toast]);

  const pageContent = (
    <>
      <Dialog open={showMetadataDialog} onOpenChange={(open) => {
        if (!open && !isBatchUploading) resetForm();
        if (!isBatchUploading) setShowMetadataDialog(open);
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {pendingFiles.length > 1 ? `Upload ${pendingFiles.length} Photos` : 'Photo Details'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isBatchUploading && fileUploadStatuses.length > 0 && (
              <PhotoDropZone
                onFilesSelected={() => {}}
                fileStatuses={fileUploadStatuses}
                isUploading={true}
                disabled={true}
                className="max-h-48 overflow-y-auto"
              />
            )}
            
            {pendingGeo.lat && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                GPS: {pendingGeo.lat.toFixed(6)}, {pendingGeo.lng?.toFixed(6)}
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Location Type
                <span className="text-destructive">*</span>
              </Label>
              <Select value={interiorExterior} onValueChange={setInteriorExterior}>
                <SelectTrigger 
                  data-testid="select-location-type"
                  className={!interiorExterior ? "border-destructive" : ""}
                >
                  <SelectValue placeholder="Select location type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Exterior">Exterior</SelectItem>
                  <SelectItem value="Interior">Interior</SelectItem>
                  <SelectItem value="Vehicle">Vehicle</SelectItem>
                </SelectContent>
              </Select>
              {!interiorExterior && (
                <p className="text-xs text-destructive">Required</p>
              )}
              <p className="text-xs text-muted-foreground">Where was this photo taken?</p>
            </div>

            <div className="space-y-2">
              <Label>Illumination</Label>
              <Select value={illuminated} onValueChange={setIlluminated}>
                <SelectTrigger data-testid="select-illumination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                  <SelectItem value="External">External</SelectItem>
                  <SelectItem value="Halo">Halo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sided</Label>
              <Select value={singleDoubleSided} onValueChange={setSingleDoubleSided}>
                <SelectTrigger data-testid="select-sided">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N/A">N/A</SelectItem>
                  <SelectItem value="Single">Single-Sided</SelectItem>
                  <SelectItem value="Double">Double-Sided</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applies to signs only. Choose N/A for surfaces like walls, windows, or vehicles.</p>
            </div>

            <div className="space-y-2">
              <Label>Surface Type</Label>
              <div className="flex flex-wrap gap-2">
                {SURFACE_TYPE_OPTIONS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={wallTypeTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleWallType(tag)}
                    data-testid={`badge-surface-${tag.toLowerCase()}`}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Optional. Describe the surface (e.g., drywall, glass, metal).</p>
            </div>

            <div className="space-y-2">
              <Label>Custom Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                  data-testid="input-custom-tag"
                />
                <Button type="button" size="sm" onClick={addCustomTag}>Add</Button>
              </div>
              {customTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {customTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => setCustomTags(customTags.filter(t => t !== tag))} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                data-testid="textarea-notes"
              />
            </div>

            <Button 
              className="w-full" 
              onClick={handleUploadWithMetadata}
              disabled={isUploading || !interiorExterior}
              data-testid="button-save-photo"
            >
              {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {pendingFiles.length > 1 ? `Upload ${pendingFiles.length} Photos` : 'Save Photo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-6">
        <Link 
          href={isShareMode 
            ? `/share/${linkId}/project` 
            : (area ? `/projects/${area.projectId}` : "/")} 
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Areas
        </Link>
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-area-name">
              {area?.name || "Loading..."}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditDialogOpen(true)}
              data-testid="button-edit-area"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {(!isShareMode || shareContext?.role === "contributor") && (
              <div className={isShareMode ? "" : "hidden md:block"}>
                <PhotoUploadButton
                  variant={isShareMode ? "mobile" : undefined}
                  onFilesSelected={handleFilesSelected}
                  onQuickAdd={handleQuickAddFiles}
                  isUploading={isUploading}
                  disabled={isUploading}
                />
              </div>
            )}
            {(!isShareMode || shareContext?.role === "contributor") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-area-menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                    data-testid="menu-delete-area"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Area
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Area"
        description="This will delete the area and all photos inside it. This action can be undone within 10 seconds."
        confirmText="DELETE AREA"
        placeholder="Type DELETE AREA to confirm"
        onConfirm={handleDeleteArea}
      />

      {area && (
        <EditAreaDialog
          area={area}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      )}

      <ConfirmDialog
        open={deletePhotoId !== null}
        onOpenChange={(open) => !open && setDeletePhotoId(null)}
        title="Delete Photo"
        description={`This will delete "${photoToDelete?.filename}". You can restore it from the Trash.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => photoToDelete && handleDeletePhoto(photoToDelete.id, photoToDelete.filename)}
      />

      <ConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title={`Delete ${selectedPhotos.size} photos?`}
        description="This will delete the selected photos. You can restore them from the Trash."
        confirmLabel="Delete All"
        variant="destructive"
        onConfirm={handleBulkDeletePhotos}
      />

      {/* Select mode action bar - available for both owner and contributor */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted rounded-lg mb-4">
          <span className="text-sm font-medium">{selectedPhotos.size} selected</span>
          {!isShareMode && (
            <>
              <Button
                size="sm"
                onClick={() => handleDownloadSelected("annotated")}
                disabled={selectedPhotos.size === 0 || isDownloading}
                data-testid="button-download-with-annotations"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                With Annotations
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadSelected("clean")}
                disabled={selectedPhotos.size === 0 || isDownloading}
                data-testid="button-download-without-annotations"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Without Annotations
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteDialogOpen(true)}
            disabled={selectedPhotos.size === 0 || isBulkDeletingPhotos}
            data-testid="button-bulk-delete-photos"
          >
            {isBulkDeletingPhotos ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={exitSelectMode}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}

      {photosLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="aspect-square bg-muted/20 animate-pulse rounded-xl" />)}
        </div>
      ) : photos?.length === 0 ? (
        <div className="space-y-6">
          <PhotoDropZone
            onFilesSelected={handleFilesSelected}
            disabled={isUploading}
          />
          <div className="text-center py-12 bg-muted/5 border border-dashed border-border rounded-xl">
            <Camera className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No photos yet.</p>
            {(!isShareMode || shareContext?.role === "contributor") && (
              <div className="mt-4">
                <PhotoUploadButton
                  onFilesSelected={handleFilesSelected}
                  onQuickAdd={handleQuickAddFiles}
                  isUploading={isUploading}
                  disabled={isUploading}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {!selectMode && photos && photos.length > 0 && (
            <div className="flex justify-end mb-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} data-testid="button-select-photos">
                <CheckSquare className="w-4 h-4 mr-2" />
                Select
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos?.map((photo) => (
              selectMode ? (
                <div 
                  key={photo.id}
                  className={`aspect-square rounded-xl overflow-hidden relative cursor-pointer border-2 shadow-sm ${selectedPhotos.has(photo.id) ? 'border-primary ring-2 ring-primary' : 'border-border'}`}
                  onClick={(e) => togglePhotoSelection(photo.id, e)}
                >
                  <img 
                    src={normalizeStorageUrl((photo as any).canonicalUrl || photo.originalUrl)} 
                    alt={photo.filename} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <Checkbox 
                      checked={selectedPhotos.has(photo.id)} 
                      className="bg-white/90"
                      data-testid={`checkbox-photo-${photo.id}`}
                    />
                  </div>
                  {hasRealAnnotations(photo.annotationData) && (
                    <div className="absolute top-2 right-2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      ANNOTATED
                    </div>
                  )}
                </div>
              ) : (
                <div key={photo.id} className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer border border-border shadow-sm">
                  <Link href={isShareMode ? `/share/${linkId}/photo/${photo.id}` : `/photos/${photo.id}`}>
                    <img 
                      src={normalizeStorageUrl((photo as any).canonicalUrl || photo.originalUrl)} 
                      alt={photo.filename} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white font-medium text-sm flex items-center gap-1">
                        <ImageIcon className="w-4 h-4" /> View Details
                      </span>
                    </div>
                  </Link>
                  {photo.geoLat && photo.geoLng && (
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                    </div>
                  )}
                  {hasRealAnnotations(photo.annotationData) && (
                    <div className="absolute top-2 right-2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      ANNOTATED
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeletePhotoId(photo.id);
                    }}
                    data-testid={`button-delete-photo-${photo.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )
            ))}
          </div>
        </>
      )}
    </>
  );
  
  if (isShareMode) {
    return (
      <ShareLayout 
        linkId={linkId} 
        projectName={area?.name || `Area #${areaId}`} 
        role={shareContext?.role || "viewer"}
      >
        {pageContent}
      </ShareLayout>
    );
  }
  
  return (
    <LayoutShell
      title={area?.name || `Area #${areaId}`}
      action={
        <PhotoUploadButton
          variant="mobile"
          onFilesSelected={handleFilesSelected}
          onQuickAdd={handleQuickAddFiles}
          isUploading={isUploading}
          disabled={isUploading}
        />
      }
    >
      {pageContent}
    </LayoutShell>
  );
}
