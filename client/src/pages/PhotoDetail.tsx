import { useState, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AnnotationCanvas, ToolType, AnnotationData, AnnotationCanvasExportHandle, normalizeAnnotationData, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE, AnnotationElementType } from "@/components/annotation-canvas";
import { NORMALIZATION_VERSION } from "@/lib/image-transform";
import { DimensionDialog } from "@/components/dimension-dialog";
import { ShareLayout } from "@/components/share-layout";
import { useShareContext } from "@/lib/share-context";
import { ArrowLeft, Save, Loader2, Square, ArrowUpRight, Ruler, MousePointer2, Type, Trash2, XCircle, Minus, ZoomIn, ZoomOut, Check, MapPin, X, Plus, MoreVertical, RotateCw, RotateCcw, RefreshCw, Settings2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpdatePhoto, usePhoto, useDeletePhoto, useRestoreDeletedPhoto } from "@/hooks/use-photos";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { generateAnnotationHash, exportAnnotatedCanvas } from "@/lib/konva-export";
import { normalizeStorageUrl } from "@/lib/storageUrl";
import type { Photo } from "@shared/schema";

export default function PhotoDetail() {
  const [ownerMatch, ownerParams] = useRoute("/photos/:id");
  const [shareMatch, shareParams] = useRoute("/share/:linkId/photo/:photoId");
  
  const shareContext = useShareContext();
  const isShareMode = !!shareContext;
  const linkId = shareContext?.linkId || shareParams?.linkId || "";
  const photoId = isShareMode 
    ? parseInt(shareParams?.photoId || "0")
    : parseInt(ownerParams?.id || "0");
  
  const shareHeaders: Record<string, string> = isShareMode ? { "X-Share-Link": linkId } : {};
  
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const ownerPhotoQuery = usePhoto(isShareMode ? 0 : photoId);
  const { data: sharePhoto, isLoading: sharePhotoLoading } = useQuery<Photo>({
    queryKey: ["/api/share", linkId, "photos", photoId],
    queryFn: async () => {
      const res = await fetch(`/api/share/${linkId}/photos/${photoId}`, { headers: shareHeaders });
      if (!res.ok) throw new Error("Failed to fetch photo");
      return res.json();
    },
    enabled: isShareMode && !!linkId && photoId > 0,
  });
  const photo = isShareMode ? sharePhoto : ownerPhotoQuery.data;
  const isLoading = isShareMode ? sharePhotoLoading : ownerPhotoQuery.isLoading;
  
  const { mutate: ownerUpdatePhoto, isPending: ownerSaving } = useUpdatePhoto();
  const shareUpdatePhotoMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/share/${linkId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...shareHeaders },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update photo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId, "photos", photoId] });
    },
  });
  const isSaving = isShareMode ? shareUpdatePhotoMutation.isPending : ownerSaving;
  
  const updatePhoto = (data: { id: number } & Record<string, any>, options?: { onSuccess?: (photo: Photo) => void; onError?: (error: Error) => void }) => {
    const { id, ...updates } = data;
    if (isShareMode) {
      shareUpdatePhotoMutation.mutate(updates, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    } else {
      ownerUpdatePhoto(data, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    }
  };
  
  const { mutate: ownerDeletePhoto, isPending: ownerDeleting } = useDeletePhoto();
  const { mutate: ownerRestorePhoto } = useRestoreDeletedPhoto();
  
  const shareDeletePhotoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/share/${linkId}/photos/${photoId}`, {
        method: "DELETE",
        headers: shareHeaders,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete photo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId] });
    },
  });
  
  const shareRestorePhotoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/share/${linkId}/photos/${photoId}/restore`, {
        method: "POST",
        headers: shareHeaders,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to restore photo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId] });
    },
  });
  
  const deletePhoto = (id: number, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
    if (isShareMode) {
      shareDeletePhotoMutation.mutate(undefined, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    } else {
      ownerDeletePhoto(id, options);
    }
  };
    
  const restorePhoto = (id: number, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
    if (isShareMode) {
      shareRestorePhotoMutation.mutate(undefined, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    } else {
      ownerRestorePhoto(id, options);
    }
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AnnotationElementType>(null);

  const [dimensionDialogOpen, setDimensionDialogOpen] = useState(false);
  const [pendingDimensionPoints, setPendingDimensionPoints] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const [pendingDimension, setPendingDimension] = useState<{ value: string; unit: string; comment: string } | null>(null);
  
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null);
  const [editingDimensionValue, setEditingDimensionValue] = useState("");
  const [editingDimensionUnit, setEditingDimensionUnit] = useState("in");
  const [editingDimensionComment, setEditingDimensionComment] = useState("");
  const [editedDimension, setEditedDimension] = useState<{ id: string; value: string; unit: string; comment: string } | null>(null);

  const [annotationData, setAnnotationData] = useState<AnnotationData | null>(null);
  const [annotationsVersion, setAnnotationsVersion] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [orientationDegrees, setOrientationDegrees] = useState<0 | 90 | 180 | 270>(0);
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Auto-save tracking
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDirty, setIsDirty] = useState(false);
  const lastSavedHashRef = useRef<string>("");
  const isSavingRef = useRef(false);
  const pendingNavigateRef = useRef<string | null>(null);

  const [interiorExterior, setInteriorExterior] = useState("Exterior");
  const [illuminated, setIlluminated] = useState("None");
  const [singleDoubleSided, setSingleDoubleSided] = useState("N/A");
  const [wallTypeTags, setWallTypeTags] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [newWallTag, setNewWallTag] = useState("");
  const [newCustomTag, setNewCustomTag] = useState("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);


  useEffect(() => {
    if (photo) {
      setInteriorExterior(photo.interiorExterior || "Exterior");
      setIlluminated(photo.illuminated || "None");
      // Map null/empty/legacy values to N/A
      const sidedValue = photo.singleDoubleSided;
      setSingleDoubleSided(!sidedValue || sidedValue === "NA" ? "N/A" : sidedValue);
      setWallTypeTags(photo.wallTypeTags || []);
      setCustomTags(photo.customTags || []);
      setNotes(photo.notes || "");
      setOrientationDegrees((photo as any).orientationDegrees || 0);
      
      // Initialize lastSavedHash from photo data
      if (photo.annotationData) {
        const hash = generateAnnotationHash(photoId, photo.annotationData as AnnotationData);
        lastSavedHashRef.current = hash;
      }
    }
  }, [photo, photoId]);

  const handleRotateLeft = useCallback(() => {
    const newOrientation = ((orientationDegrees - 90 + 360) % 360) as 0 | 90 | 180 | 270;
    setOrientationDegrees(newOrientation);
    updatePhoto({ id: photoId, orientationDegrees: newOrientation });
  }, [orientationDegrees, photoId, updatePhoto]);

  const handleRotateRight = useCallback(() => {
    const newOrientation = ((orientationDegrees + 90) % 360) as 0 | 90 | 180 | 270;
    setOrientationDegrees(newOrientation);
    updatePhoto({ id: photoId, orientationDegrees: newOrientation });
  }, [orientationDegrees, photoId, updatePhoto]);

  const handleResetRotation = useCallback(() => {
    setOrientationDegrees(0);
    updatePhoto({ id: photoId, orientationDegrees: 0 });
  }, [photoId, updatePhoto]);

  const saveMetadata = useCallback((field: string, value: unknown) => {
    updatePhoto({
      id: photoId,
      [field]: value,
    });
  }, [photoId, updatePhoto]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const deleteSelectedRef = useRef<(() => void) | null>(null);
  const clearAllRef = useRef<(() => void) | null>(null);
  const applyStyleToSelectedRef = useRef<((style: { color?: string; strokeWidth?: number; fontSize?: number }) => void) | null>(null);
  const canvasExportRef = useRef<AnnotationCanvasExportHandle | null>(null);

  // Upload annotated image in background for export caching using live stage
  const uploadAnnotatedImageFromLiveStage = useCallback(async (data: AnnotationData) => {
    if (!canvasExportRef.current || !photo?.originalUrl) return;
    
    try {
      const blob = await canvasExportRef.current.exportToBlob("png");
      if (!blob) return;

      const annotationHash = generateAnnotationHash(photoId, data);
      
      // Convert blob to base64 data URL
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to convert blob"));
        reader.readAsDataURL(blob);
      });

      // Upload to server
      const response = await fetch(`/api/photos/${photoId}/annotated-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, annotationHash, format: "png" }),
      });

      if (!response.ok) {
        throw new Error("Failed to upload annotated image");
      }
    } catch (error) {
      console.error("Failed to upload annotated image:", error);
    }
  }, [photo?.originalUrl, photoId]);

  // Immediate save function (for navigation guard)
  const saveAnnotationsImmediate = useCallback(
    async (data: AnnotationData): Promise<boolean> => {
      if (isSavingRef.current) return true;
      isSavingRef.current = true;
      setSaveStatus("saving");
      
      return new Promise((resolve) => {
        updatePhoto(
          { id: photoId, annotationData: data },
          {
            onSuccess: () => {
              const hash = generateAnnotationHash(photoId, data);
              lastSavedHashRef.current = hash;
              setIsDirty(false);
              setSaveStatus("saved");
              isSavingRef.current = false;
              setTimeout(() => uploadAnnotatedImageFromLiveStage(data), 100);
              setTimeout(() => setSaveStatus("idle"), 2000);
              resolve(true);
            },
            onError: () => {
              setSaveStatus("error");
              isSavingRef.current = false;
              resolve(false);
            },
          }
        );
      });
    },
    [photoId, updatePhoto, uploadAnnotatedImageFromLiveStage]
  );

  // Debounced server save (1.5s) - only persists, doesn't affect local state
  const debouncedServerSave = useCallback(
    (data: AnnotationData) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Mark as dirty
      const hash = generateAnnotationHash(photoId, data);
      if (hash !== lastSavedHashRef.current) {
        setIsDirty(true);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveAnnotationsImmediate(data);
      }, 1500);
    },
    [photoId, saveAnnotationsImmediate]
  );

  // Auto-save (silent) - called on every annotation change from canvas
  const handleAutoSave = useCallback(
    (data: AnnotationData) => {
      setAnnotationData(data);
      setAnnotationsVersion(v => v + 1);
      debouncedServerSave(data);
    },
    [debouncedServerSave]
  );

  // beforeunload handler - warn if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && annotationData) {
        // Try to save
        saveAnnotationsImmediate(annotationData);
        // Show browser prompt
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, annotationData, saveAnnotationsImmediate]);

  // Handle back navigation with save
  const handleBack = useCallback(async () => {
    const destination = isShareMode 
      ? (photo?.areaId ? `/share/${linkId}/area/${photo.areaId}` : `/share/${linkId}/project`)
      : (photo?.areaId ? `/areas/${photo.areaId}` : '/');
    
    if (isDirty && annotationData) {
      // Clear any pending debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Save immediately before navigating
      const success = await saveAnnotationsImmediate(annotationData);
      if (!success) {
        // Save failed - show error and don't navigate
        toast({
          title: "Could not save annotations",
          description: "Please check your connection and try again.",
          variant: "destructive",
        });
        return;
      }
    }
    
    navigate(destination);
  }, [photo?.areaId, isDirty, annotationData, saveAnnotationsImmediate, navigate, toast]);

  // Manual save (with toast) - called when save button is clicked
  const handleManualSave = useCallback(() => {
    if (annotationData) {
      updatePhoto(
        {
          id: photoId,
          annotationData,
        },
        {
          onSuccess: () => {
            toast({
              title: "Annotations saved",
            });
          },
        }
      );
    }
  }, [photoId, annotationData, updatePhoto, toast]);

  // Update selected element's style
  const updateSelectedElementStyle = useCallback((styleUpdate: { color?: string; strokeWidth?: number; fontSize?: number }) => {
    if (!selectedId || !annotationData) return;
    
    let updated = false;
    const newData = { ...annotationData };
    
    // Update line
    const lineIdx = newData.lines.findIndex(l => l.id === selectedId);
    if (lineIdx >= 0) {
      newData.lines = [...newData.lines];
      newData.lines[lineIdx] = { ...newData.lines[lineIdx], ...styleUpdate };
      updated = true;
    }
    
    // Update arrow
    const arrowIdx = newData.arrows.findIndex(a => a.id === selectedId);
    if (arrowIdx >= 0) {
      newData.arrows = [...newData.arrows];
      newData.arrows[arrowIdx] = { ...newData.arrows[arrowIdx], ...styleUpdate };
      updated = true;
    }
    
    // Update rect
    const rectIdx = newData.rects.findIndex(r => r.id === selectedId);
    if (rectIdx >= 0) {
      newData.rects = [...newData.rects];
      newData.rects[rectIdx] = { ...newData.rects[rectIdx], ...styleUpdate };
      updated = true;
    }
    
    // Update text
    const textIdx = newData.texts.findIndex(t => t.id === selectedId);
    if (textIdx >= 0) {
      newData.texts = [...newData.texts];
      newData.texts[textIdx] = { ...newData.texts[textIdx], ...styleUpdate };
      updated = true;
    }
    
    // Update dimension
    const dimIdx = newData.dimensions.findIndex(d => d.id === selectedId);
    if (dimIdx >= 0) {
      newData.dimensions = [...newData.dimensions];
      newData.dimensions[dimIdx] = { ...newData.dimensions[dimIdx], ...styleUpdate };
      updated = true;
    }
    
    if (updated) {
      setAnnotationData(newData);
      // Note: Do NOT increment annotationsVersion here - that would trigger the canvas
      // to sync from props, overwriting the user's style change. The canvas already
      // has the correct data from its local state.
      debouncedServerSave(newData);
    }
  }, [selectedId, annotationData, debouncedServerSave]);

  // Handle style control changes - update selected element or set default
  const handleColorChange = useCallback((newColor: string) => {
    if (selectedId) {
      updateSelectedElementStyle({ color: newColor });
      // Also update the canvas's local state directly
      applyStyleToSelectedRef.current?.({ color: newColor });
    }
    setColor(newColor);
  }, [selectedId, updateSelectedElementStyle]);

  const handleStrokeWidthChange = useCallback((newWidth: number) => {
    if (selectedId && selectedType && ["line", "arrow", "rect", "dimension"].includes(selectedType)) {
      updateSelectedElementStyle({ strokeWidth: newWidth });
      // Also update the canvas's local state directly
      applyStyleToSelectedRef.current?.({ strokeWidth: newWidth });
    }
    setStrokeWidth(newWidth);
  }, [selectedId, selectedType, updateSelectedElementStyle]);

  const handleFontSizeChange = useCallback((newSize: number) => {
    if (selectedId && selectedType && ["text", "dimension"].includes(selectedType)) {
      updateSelectedElementStyle({ fontSize: newSize });
      // Also update the canvas's local state directly
      applyStyleToSelectedRef.current?.({ fontSize: newSize });
    }
    setFontSize(newSize);
  }, [selectedId, selectedType, updateSelectedElementStyle]);

  // Track previous selectedId to detect actual selection changes
  const prevSelectedIdRef = useRef<string | null>(null);
  
  // When selection changes, populate controls with selected element's styles
  // Only runs when selectedId actually changes, not when annotation data updates
  useEffect(() => {
    // Only sync controls when the selection actually changed
    if (prevSelectedIdRef.current === selectedId) return;
    prevSelectedIdRef.current = selectedId;
    
    if (!selectedId || !annotationData) return;
    
    // Find the selected element and get its styles
    const line = annotationData.lines.find(l => l.id === selectedId);
    if (line) {
      setColor(line.color);
      setStrokeWidth(line.strokeWidth || DEFAULT_STROKE_WIDTH);
      return;
    }
    
    const arrow = annotationData.arrows.find(a => a.id === selectedId);
    if (arrow) {
      setColor(arrow.color);
      setStrokeWidth(arrow.strokeWidth || DEFAULT_STROKE_WIDTH);
      return;
    }
    
    const rect = annotationData.rects.find(r => r.id === selectedId);
    if (rect) {
      setColor(rect.color);
      setStrokeWidth(rect.strokeWidth || DEFAULT_STROKE_WIDTH);
      return;
    }
    
    const text = annotationData.texts.find(t => t.id === selectedId);
    if (text) {
      setColor(text.color);
      setFontSize(text.fontSize || DEFAULT_FONT_SIZE);
      return;
    }
    
    const dimension = annotationData.dimensions.find(d => d.id === selectedId);
    if (dimension) {
      setColor(dimension.color);
      setStrokeWidth(dimension.strokeWidth || DEFAULT_STROKE_WIDTH);
      setFontSize(dimension.fontSize || DEFAULT_FONT_SIZE);
      return;
    }
  }, [selectedId, annotationData]);

  const handleRequestDimension = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      setPendingDimensionPoints({ start, end });
      setDimensionDialogOpen(true);
    },
    []
  );

  const handleClearPendingDimension = useCallback(() => {
    setPendingDimension(null);
    setPendingDimensionPoints(null);
  }, []);

  const handleEditDimension = useCallback(
    (dimensionId: string, currentValue: string, currentUnit: string, currentComment: string) => {
      setEditingDimensionId(dimensionId);
      setEditingDimensionValue(currentValue);
      setEditingDimensionUnit(currentUnit);
      setEditingDimensionComment(currentComment);
      setDimensionDialogOpen(true);
    },
    []
  );

  const handleDimensionDialogConfirm = useCallback(
    (value: string, unit: string, comment: string) => {
      if (editingDimensionId) {
        setEditedDimension({ id: editingDimensionId, value, unit, comment });
        setEditingDimensionId(null);
      } else {
        setPendingDimension({ value, unit, comment });
      }
      setDimensionDialogOpen(false);
    },
    [editingDimensionId]
  );

  const handleClearEditedDimension = useCallback(() => {
    setEditedDimension(null);
  }, []);

  const handleDimensionDialogClose = useCallback((open: boolean) => {
    setDimensionDialogOpen(open);
    if (!open) {
      setEditingDimensionId(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const handleDeletePhoto = useCallback(() => {
    if (!photo) return;
    
    const areaId = photo.areaId;
    
    deletePhoto(photoId, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        navigate(isShareMode ? `/share/${linkId}/area/${areaId}` : `/areas/${areaId}`);
        
        const { dismiss } = toast({
          title: "Photo deleted",
          description: "Click Undo to restore this photo",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (undoTimeoutRef.current) {
                  clearTimeout(undoTimeoutRef.current);
                  undoTimeoutRef.current = null;
                }
                restorePhoto(photoId, {
                  onSuccess: () => {
                    toast({ title: "Photo restored" });
                    navigate(isShareMode ? `/share/${linkId}/photo/${photoId}` : `/photos/${photoId}`);
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
              data-testid="button-undo-delete-photo"
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
  }, [photo, photoId, deletePhoto, restorePhoto, navigate, toast]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!photo) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <p className="text-muted-foreground mb-4">Photo not found</p>
        <Button variant="outline" onClick={() => navigate('/')}>Go Back</Button>
      </div>
    );
  }

  const rawPhotoAnnotations = photo.annotationData && typeof photo.annotationData === 'object' && 'lines' in (photo.annotationData as object)
    ? photo.annotationData as AnnotationData 
    : null;
  
  const photoAnnotations = rawPhotoAnnotations && (rawPhotoAnnotations.normalizedVersion || 0) < NORMALIZATION_VERSION
    ? normalizeAnnotationData(rawPhotoAnnotations)
    : rawPhotoAnnotations;
    
  const currentAnnotations: AnnotationData = annotationData || photoAnnotations || {
    lines: [],
    rects: [],
    arrows: [],
    texts: [],
    dimensions: [],
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-16 border-b border-border flex items-center justify-between px-4 bg-card sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            disabled={saveStatus === "saving"}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="font-semibold hidden md:inline-block">Annotation Editor</span>
        </div>

        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg overflow-x-auto">
          <Button
            variant={activeTool === "select" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveTool("select")}
            title="Select / Move"
            data-testid="button-tool-select"
          >
            <MousePointer2 className="w-4 h-4" />
          </Button>
          <Button
            variant={activeTool === "line" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveTool("line")}
            title="Draw Line"
            data-testid="button-tool-line"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button
            variant={activeTool === "dimension" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveTool("dimension")}
            title="Dimension Line"
            data-testid="button-tool-dimension"
          >
            <Ruler className="w-4 h-4" />
          </Button>
          <Button
            variant={activeTool === "rect" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveTool("rect")}
            title="Rectangle"
            data-testid="button-tool-rect"
          >
            <Square className="w-4 h-4" />
          </Button>
          <Button
            variant={activeTool === "arrow" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveTool("arrow")}
            title="Arrow"
            data-testid="button-tool-arrow"
          >
            <ArrowUpRight className="w-4 h-4" />
          </Button>
          <Button
            variant={activeTool === "text" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveTool("text")}
            title="Add Text"
            data-testid="button-tool-text"
          >
            <Type className="w-4 h-4" />
          </Button>

          {activeTool !== "select" && (
            <Button
              variant="default"
              size="sm"
              className="h-8 px-3 shrink-0 ml-1 gap-1"
              onClick={() => setActiveTool("select")}
              title="Done with tool"
              data-testid="button-tool-done"
            >
              <Check className="w-4 h-4" />
              <span className="text-xs">Done</span>
            </Button>
          )}

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            onClick={() => {
              if (selectedId && deleteSelectedRef.current) {
                deleteSelectedRef.current();
                toast({ title: "Item deleted" });
              }
            }}
            disabled={!selectedId}
            title="Delete Selected"
            data-testid="button-delete-selected"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            onClick={() => setClearAllDialogOpen(true)}
            title="Clear All"
            data-testid="button-clear-all"
          >
            <XCircle className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              const newScale = Math.max(0.5, zoomScale - 0.25);
              setZoomScale(newScale);
              if (newScale === 1) setStagePosition({ x: 0, y: 0 });
            }}
            disabled={zoomScale <= 0.5}
            title="Zoom Out"
            data-testid="button-zoom-out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            variant={zoomScale === 1 ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2 shrink-0 text-xs"
            onClick={() => {
              setZoomScale(1);
              setStagePosition({ x: 0, y: 0 });
            }}
            title="Reset Zoom"
            data-testid="button-zoom-reset"
          >
            {Math.round(zoomScale * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setZoomScale((prev) => Math.min(3, prev + 0.25))}
            disabled={zoomScale >= 3}
            title="Zoom In"
            data-testid="button-zoom-in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleRotateLeft}
            title="Rotate Left 90°"
            data-testid="button-rotate-left"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant={orientationDegrees !== 0 ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2 shrink-0 text-xs"
            onClick={handleResetRotation}
            disabled={orientationDegrees === 0}
            title="Reset Rotation"
            data-testid="button-rotation-reset"
          >
            {orientationDegrees}°
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleRotateRight}
            title="Rotate Right 90°"
            data-testid="button-rotate-right"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Failed
              </span>
            )}
            <Button
              onClick={handleManualSave}
              disabled={isSaving || saveStatus === "saving"}
              className="gap-2 bg-primary text-primary-foreground"
              data-testid="button-save"
            >
              {(isSaving || saveStatus === "saving") ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden md:inline">Save</span>
            </Button>
          </div>
          
          {(!isShareMode || shareContext?.role === "contributor") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-photo-menu">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  data-testid="menu-delete-photo"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Photo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Photo"
        description="This will remove the photo from all exports and reports. This action can be undone within 10 seconds."
        confirmText="DELETE PHOTO"
        placeholder="Type DELETE PHOTO to confirm"
        onConfirm={handleDeletePhoto}
      />

      <ConfirmDialog
        open={clearAllDialogOpen}
        onOpenChange={setClearAllDialogOpen}
        title="Clear all annotations?"
        description="This removes all lines, measurements, and text for this photo. This can't be undone."
        confirmLabel="Clear annotations"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          try {
            if (clearAllRef.current) {
              clearAllRef.current();
            }
            toast({ title: "Annotations cleared" });
          } catch {
            toast({ 
              title: "Couldn't clear annotations. Please try again.", 
              variant: "destructive" 
            });
          }
        }}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 bg-neutral-900 p-4 flex items-center justify-center overflow-auto">
          <div ref={canvasContainerRef} className="w-full max-w-4xl h-full max-h-[80vh] aspect-video bg-black shadow-2xl relative">
            <AnnotationCanvas
              imageUrl={normalizeStorageUrl((photo as any).canonicalUrl || photo.originalUrl)}
              annotations={currentAnnotations}
              onSave={handleAutoSave}
              tool={activeTool}
              color={color}
              strokeWidth={strokeWidth}
              fontSize={fontSize}
              scale={zoomScale}
              onZoomChange={setZoomScale}
              stagePosition={stagePosition}
              onPositionChange={setStagePosition}
              onRequestDimension={handleRequestDimension}
              pendingDimension={pendingDimension}
              onClearPendingDimension={handleClearPendingDimension}
              selectedId={selectedId}
              onSelectId={setSelectedId}
              onSelectType={setSelectedType}
              annotationsVersion={annotationsVersion}
              deleteSelectedRef={deleteSelectedRef}
              clearAllRef={clearAllRef}
              applyStyleToSelectedRef={applyStyleToSelectedRef}
              onEditDimension={handleEditDimension}
              editedDimension={editedDimension}
              onClearEditedDimension={handleClearEditedDimension}
              exportRef={canvasExportRef}
              orientationDegrees={orientationDegrees}
            />
          </div>
        </div>

        <div className="w-80 border-l border-border bg-card p-4 hidden lg:block overflow-y-auto">
          <h3 className="font-display font-bold text-lg mb-4">Properties</h3>

          <div className="space-y-4">
            {photo.geoLat && photo.geoLng && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1.5 rounded">
                <MapPin className="w-3 h-3" />
                <span>{photo.geoLat.toFixed(5)}, {photo.geoLng.toFixed(5)}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Location Type</Label>
              <Select 
                value={interiorExterior} 
                onValueChange={(v) => {
                  setInteriorExterior(v);
                  saveMetadata("interiorExterior", v);
                }}
              >
                <SelectTrigger data-testid="select-location-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Interior">Interior</SelectItem>
                  <SelectItem value="Exterior">Exterior</SelectItem>
                  <SelectItem value="Vehicle">Vehicle</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Where was this photo taken?</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Illumination</Label>
              <Select 
                value={illuminated} 
                onValueChange={(v) => {
                  setIlluminated(v);
                  saveMetadata("illuminated", v);
                }}
              >
                <SelectTrigger data-testid="select-illumination">
                  <SelectValue placeholder="Select illumination" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                  <SelectItem value="External">External</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Sided</Label>
              <Select 
                value={singleDoubleSided} 
                onValueChange={(v) => {
                  setSingleDoubleSided(v);
                  saveMetadata("singleDoubleSided", v);
                }}
              >
                <SelectTrigger data-testid="select-sided">
                  <SelectValue placeholder="Select sided" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N/A">N/A</SelectItem>
                  <SelectItem value="Single">Single-sided</SelectItem>
                  <SelectItem value="Double">Double-sided</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applies to signs only. Choose N/A for surfaces like walls, windows, or vehicles.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Surface Type</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {wallTypeTags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs gap-1">
                    {tag}
                    <button
                      onClick={() => {
                        const newTags = wallTypeTags.filter((_, idx) => idx !== i);
                        setWallTypeTags(newTags);
                        saveMetadata("wallTypeTags", newTags);
                      }}
                      className="hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && !wallTypeTags.includes(v)) {
                      const newTags = [...wallTypeTags, v];
                      setWallTypeTags(newTags);
                      saveMetadata("wallTypeTags", newTags);
                    }
                  }}
                >
                  <SelectTrigger className="text-xs" data-testid="select-surface-type">
                    <SelectValue placeholder="Add surface type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["CMU", "Drywall", "Glass", "Metal", "Brick", "Wood", "Concrete", "Stucco", "Window", "Vinyl", "Painted Metal", "Composite Panel", "Concrete Block"].filter(t => !wallTypeTags.includes(t)).map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Optional. Describe the surface (e.g., drywall, glass, metal).</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Custom Tags</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {customTags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs gap-1">
                    {tag}
                    <button
                      onClick={() => {
                        const newTags = customTags.filter((_, idx) => idx !== i);
                        setCustomTags(newTags);
                        saveMetadata("customTags", newTags);
                      }}
                      className="hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={newCustomTag}
                  onChange={(e) => setNewCustomTag(e.target.value)}
                  placeholder="Add custom tag..."
                  className="text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCustomTag.trim()) {
                      const newTags = [...customTags, newCustomTag.trim()];
                      setCustomTags(newTags);
                      saveMetadata("customTags", newTags);
                      setNewCustomTag("");
                    }
                  }}
                  data-testid="input-custom-tag"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (newCustomTag.trim()) {
                      const newTags = [...customTags, newCustomTag.trim()];
                      setCustomTags(newTags);
                      saveMetadata("customTags", newTags);
                      setNewCustomTag("");
                    }
                  }}
                  data-testid="button-add-custom-tag"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveMetadata("notes", notes)}
                placeholder="Add notes about this photo..."
                className="text-xs min-h-[80px]"
                data-testid="textarea-notes"
              />
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              {selectedId && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 rounded-md px-2 py-1.5">
                  <span className="font-medium">Editing:</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedType === "line" ? "Line" :
                     selectedType === "arrow" ? "Arrow" :
                     selectedType === "rect" ? "Rectangle" :
                     selectedType === "text" ? "Text" :
                     selectedType === "dimension" ? "Dimension" : "Selected"}
                  </Badge>
                </div>
              )}
              
              <div className="space-y-2">
                <Label className="text-xs">
                  {selectedId ? "Color" : "Stroke Color"}
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    "#ef4444",
                    "#eab308",
                    "#22c55e",
                    "#3b82f6",
                    "#ffffff",
                    "#000000",
                  ].map((c) => (
                    <button
                      key={c}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                        color === c
                          ? "border-foreground ring-2 ring-offset-1 ring-offset-background ring-foreground"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => handleColorChange(c)}
                      data-testid={`button-color-${c.replace("#", "")}`}
                    />
                  ))}
                </div>
              </div>
              
              {(!selectedId || (selectedType && ["line", "arrow", "rect", "dimension"].includes(selectedType))) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Line Thickness</Label>
                    <span className="text-xs text-muted-foreground">{strokeWidth}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[2, 4, 6, 8, 10].map((w) => (
                      <button
                        key={w}
                        className={cn(
                          "flex-1 h-8 rounded-md border transition-colors",
                          strokeWidth === w
                            ? "border-foreground bg-accent"
                            : "border-border hover:border-foreground/50"
                        )}
                        onClick={() => handleStrokeWidthChange(w)}
                        data-testid={`button-stroke-width-${w}`}
                      >
                        <div
                          className="mx-auto rounded-full bg-foreground"
                          style={{ width: `${w * 3}px`, height: `${w}px` }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {(!selectedId || (selectedType && ["text", "dimension"].includes(selectedType))) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Text Size</Label>
                    <span className="text-xs text-muted-foreground">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[14, 20, 26, 32, 40].map((s) => (
                      <button
                        key={s}
                        className={cn(
                          "flex-1 h-8 rounded-md border transition-colors flex items-center justify-center",
                          fontSize === s
                            ? "border-foreground bg-accent"
                            : "border-border hover:border-foreground/50"
                        )}
                        onClick={() => handleFontSizeChange(s)}
                        data-testid={`button-font-size-${s}`}
                      >
                        <span style={{ fontSize: `${Math.min(s * 0.5, 14)}px` }}>A</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="font-medium text-xs mb-2 text-muted-foreground">
                Instructions
              </h4>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                <li>Select tool to select/move items</li>
                <li>Draw by clicking and dragging</li>
                <li>Dimension tool adds measurements</li>
                <li>Double-click text to edit</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <DimensionDialog
        open={dimensionDialogOpen}
        onOpenChange={handleDimensionDialogClose}
        onConfirm={handleDimensionDialogConfirm}
        initialValue={editingDimensionId ? editingDimensionValue : ""}
        initialUnit={editingDimensionId ? editingDimensionUnit : "in"}
        initialComment={editingDimensionId ? editingDimensionComment : ""}
        title={editingDimensionId ? "Edit Dimension" : "Add Dimension"}
      />

      {/* Mobile Floating Action Button */}
      <Button
        className="lg:hidden fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        size="icon"
        onClick={() => setMobileDrawerOpen(true)}
        data-testid="button-mobile-properties"
      >
        <Settings2 className="w-6 h-6" />
      </Button>

      {/* Mobile Bottom Drawer */}
      <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>Photo Options</DrawerTitle>
          </DrawerHeader>
          <Tabs defaultValue="tools" className="px-4 pb-6">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="tools" data-testid="tab-tools">Tools</TabsTrigger>
              <TabsTrigger value="properties" data-testid="tab-properties">Properties</TabsTrigger>
            </TabsList>
            <TabsContent value="tools" className="space-y-4 overflow-y-auto max-h-[60vh]">
              {selectedId && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 rounded-md px-2 py-1.5">
                  <span className="font-medium">Editing:</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedType === "line" ? "Line" :
                     selectedType === "arrow" ? "Arrow" :
                     selectedType === "rect" ? "Rectangle" :
                     selectedType === "text" ? "Text" :
                     selectedType === "dimension" ? "Dimension" : "Selected"}
                  </Badge>
                </div>
              )}
              
              <div className="space-y-2">
                <Label className="text-xs">
                  {selectedId ? "Color" : "Stroke Color"}
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    "#ef4444",
                    "#eab308",
                    "#22c55e",
                    "#3b82f6",
                    "#ffffff",
                    "#000000",
                  ].map((c) => (
                    <button
                      key={c}
                      className={cn(
                        "w-9 h-9 rounded-full border-2 transition-transform hover:scale-110",
                        color === c
                          ? "border-foreground ring-2 ring-offset-1 ring-offset-background ring-foreground"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => handleColorChange(c)}
                      data-testid={`button-mobile-color-${c.replace("#", "")}`}
                    />
                  ))}
                </div>
              </div>
              
              {(!selectedId || (selectedType && ["line", "arrow", "rect", "dimension"].includes(selectedType))) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Line Thickness</Label>
                    <span className="text-xs text-muted-foreground">{strokeWidth}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[2, 4, 6, 8, 10].map((w) => (
                      <button
                        key={w}
                        className={cn(
                          "flex-1 h-10 rounded-md border transition-colors",
                          strokeWidth === w
                            ? "border-foreground bg-accent"
                            : "border-border hover:border-foreground/50"
                        )}
                        onClick={() => handleStrokeWidthChange(w)}
                        data-testid={`button-mobile-stroke-width-${w}`}
                      >
                        <div
                          className="mx-auto rounded-full bg-foreground"
                          style={{ width: `${w * 3}px`, height: `${w}px` }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {(!selectedId || (selectedType && ["text", "dimension"].includes(selectedType))) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Text Size</Label>
                    <span className="text-xs text-muted-foreground">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[14, 20, 26, 32, 40].map((s) => (
                      <button
                        key={s}
                        className={cn(
                          "flex-1 h-10 rounded-md border transition-colors flex items-center justify-center",
                          fontSize === s
                            ? "border-foreground bg-accent"
                            : "border-border hover:border-foreground/50"
                        )}
                        onClick={() => handleFontSizeChange(s)}
                        data-testid={`button-mobile-font-size-${s}`}
                      >
                        <span style={{ fontSize: `${Math.min(s * 0.5, 14)}px` }}>A</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="properties" className="space-y-4 overflow-y-auto max-h-[60vh]">
              {photo.geoLat && photo.geoLng && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1.5 rounded">
                  <MapPin className="w-3 h-3" />
                  <span>{photo.geoLat.toFixed(5)}, {photo.geoLng.toFixed(5)}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Location Type</Label>
                <Select 
                  value={interiorExterior} 
                  onValueChange={(v) => {
                    setInteriorExterior(v);
                    saveMetadata("interiorExterior", v);
                  }}
                >
                  <SelectTrigger data-testid="mobile-select-location-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Interior">Interior</SelectItem>
                    <SelectItem value="Exterior">Exterior</SelectItem>
                    <SelectItem value="Vehicle">Vehicle</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Where was this photo taken?</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Illumination</Label>
                <Select 
                  value={illuminated} 
                  onValueChange={(v) => {
                    setIlluminated(v);
                    saveMetadata("illuminated", v);
                  }}
                >
                  <SelectTrigger data-testid="mobile-select-illumination">
                    <SelectValue placeholder="Select illumination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    <SelectItem value="Internal">Internal</SelectItem>
                    <SelectItem value="External">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Sided</Label>
                <Select 
                  value={singleDoubleSided} 
                  onValueChange={(v) => {
                    setSingleDoubleSided(v);
                    saveMetadata("singleDoubleSided", v);
                  }}
                >
                  <SelectTrigger data-testid="mobile-select-sided">
                    <SelectValue placeholder="Select sided" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N/A">N/A</SelectItem>
                    <SelectItem value="Single">Single-sided</SelectItem>
                    <SelectItem value="Double">Double-sided</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Applies to signs only. Choose N/A for surfaces like walls, windows, or vehicles.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Surface Type</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {wallTypeTags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1">
                      {tag}
                      <button
                        onClick={() => {
                          const newTags = wallTypeTags.filter((_, idx) => idx !== i);
                          setWallTypeTags(newTags);
                          saveMetadata("wallTypeTags", newTags);
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && !wallTypeTags.includes(v)) {
                      const newTags = [...wallTypeTags, v];
                      setWallTypeTags(newTags);
                      saveMetadata("wallTypeTags", newTags);
                    }
                  }}
                >
                  <SelectTrigger className="text-xs" data-testid="mobile-select-surface-type">
                    <SelectValue placeholder="Add surface type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["CMU", "Drywall", "Glass", "Metal", "Brick", "Wood", "Concrete", "Stucco", "Window", "Vinyl", "Painted Metal", "Composite Panel", "Concrete Block"].filter(t => !wallTypeTags.includes(t)).map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional. Describe the surface (e.g., drywall, glass, metal).</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Custom Tags</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {customTags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs gap-1">
                      {tag}
                      <button
                        onClick={() => {
                          const newTags = customTags.filter((_, idx) => idx !== i);
                          setCustomTags(newTags);
                          saveMetadata("customTags", newTags);
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    value={newCustomTag}
                    onChange={(e) => setNewCustomTag(e.target.value)}
                    placeholder="Add custom tag..."
                    className="text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCustomTag.trim()) {
                        const newTags = [...customTags, newCustomTag.trim()];
                        setCustomTags(newTags);
                        saveMetadata("customTags", newTags);
                        setNewCustomTag("");
                      }
                    }}
                    data-testid="mobile-input-custom-tag"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (newCustomTag.trim()) {
                        const newTags = [...customTags, newCustomTag.trim()];
                        setCustomTags(newTags);
                        saveMetadata("customTags", newTags);
                        setNewCustomTag("");
                      }
                    }}
                    data-testid="mobile-button-add-custom-tag"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => saveMetadata("notes", notes)}
                  placeholder="Add notes about this photo..."
                  className="text-xs min-h-[80px]"
                  data-testid="mobile-textarea-notes"
                />
              </div>
            </TabsContent>
          </Tabs>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
