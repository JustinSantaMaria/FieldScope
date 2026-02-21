import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LayoutShell } from "@/components/layout-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Trash2, FolderOpen, Image, RotateCcw, Loader2, MapPin, Calendar, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { normalizeStorageUrl } from "@/lib/storageUrl";
import { buildPhotoExportName, type Area, type Photo } from "@shared/schema";

type DeletedArea = Area & { projectName: string; photoCount: number; deletedByName: string | null };
type DeletedPhoto = Photo & { projectName: string; areaName: string; deletedByName: string | null };

export default function Trash() {
  const { toast } = useToast();
  const [selectedAreas, setSelectedAreas] = useState<Set<number>>(new Set());
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  
  const [deleteAreaId, setDeleteAreaId] = useState<number | null>(null);
  const [deletePhotoId, setDeletePhotoId] = useState<number | null>(null);
  const [bulkDeleteAreasOpen, setBulkDeleteAreasOpen] = useState(false);
  const [bulkDeletePhotosOpen, setBulkDeletePhotosOpen] = useState(false);

  const { data: deletedAreas = [], isLoading: loadingAreas } = useQuery<DeletedArea[]>({
    queryKey: ['/api/trash', 'areas'],
    queryFn: () => fetch('/api/trash?type=areas').then(r => r.json()),
  });

  const { data: deletedPhotos = [], isLoading: loadingPhotos } = useQuery<DeletedPhoto[]>({
    queryKey: ['/api/trash', 'photos'],
    queryFn: () => fetch('/api/trash?type=photos').then(r => r.json()),
  });

  const restoreAreaMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('POST', `/api/areas/${id}/restore-deleted`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Area restored", description: "The area and its photos have been restored." });
    },
  });

  const restorePhotoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('POST', `/api/photos/${id}/restore-deleted`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      toast({ title: "Photo restored" });
    },
  });

  const bulkRestoreAreasMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest('POST', '/api/areas/bulk-restore', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setSelectedAreas(new Set());
      toast({ title: "Areas restored", description: `${selectedAreas.size} areas have been restored.` });
    },
  });

  const bulkRestorePhotosMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest('POST', '/api/photos/bulk-restore', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      setSelectedPhotos(new Set());
      toast({ title: "Photos restored", description: `${selectedPhotos.size} photos have been restored.` });
    },
  });

  const permanentDeleteAreaMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/trash/areas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      setDeleteAreaId(null);
      toast({ title: "Area permanently deleted", description: "The area and its photos have been removed forever." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete area", description: error.message, variant: "destructive" });
    },
  });

  const permanentDeletePhotoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/trash/photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      setDeletePhotoId(null);
      toast({ title: "Photo permanently deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete photo", description: error.message, variant: "destructive" });
    },
  });

  const bulkPermanentDeleteAreasMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest('POST', '/api/trash/areas/bulk-delete', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      setBulkDeleteAreasOpen(false);
      const count = selectedAreas.size;
      setSelectedAreas(new Set());
      toast({ title: `${count} areas permanently deleted` });
    },
    onError: (error: Error) => {
      setBulkDeleteAreasOpen(false);
      toast({ title: "Failed to delete areas", description: error.message, variant: "destructive" });
    },
  });

  const bulkPermanentDeletePhotosMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest('POST', '/api/trash/photos/bulk-delete', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trash'] });
      setBulkDeletePhotosOpen(false);
      const count = selectedPhotos.size;
      setSelectedPhotos(new Set());
      toast({ title: `${count} photos permanently deleted` });
    },
    onError: (error: Error) => {
      setBulkDeletePhotosOpen(false);
      toast({ title: "Failed to delete photos", description: error.message, variant: "destructive" });
    },
  });

  const areaToDelete = deletedAreas.find(a => a.id === deleteAreaId);
  const photoToDelete = deletedPhotos.find(p => p.id === deletePhotoId);

  const toggleAreaSelection = (id: number) => {
    const newSet = new Set(selectedAreas);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAreas(newSet);
  };

  const togglePhotoSelection = (id: number) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPhotos(newSet);
  };

  const selectAllAreas = () => {
    if (selectedAreas.size === deletedAreas.length) {
      setSelectedAreas(new Set());
    } else {
      setSelectedAreas(new Set(deletedAreas.map(a => a.id)));
    }
  };

  const selectAllPhotos = () => {
    if (selectedPhotos.size === deletedPhotos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(deletedPhotos.map(p => p.id)));
    }
  };

  return (
    <LayoutShell title="Trash">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Trash</h1>
          <p className="text-muted-foreground mt-1">Deleted items can be restored here</p>
        </div>

        <Tabs defaultValue="areas" className="w-full">
          <TabsList data-testid="trash-tabs">
            <TabsTrigger value="areas" data-testid="tab-areas">
              <FolderOpen className="w-4 h-4 mr-2" />
              Areas ({deletedAreas.length})
            </TabsTrigger>
            <TabsTrigger value="photos" data-testid="tab-photos">
              <Image className="w-4 h-4 mr-2" />
              Photos ({deletedPhotos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="areas" className="mt-4">
            {selectedAreas.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
                <span className="text-sm font-medium">{selectedAreas.size} selected</span>
                <Button
                  size="sm"
                  onClick={() => bulkRestoreAreasMutation.mutate(Array.from(selectedAreas))}
                  disabled={bulkRestoreAreasMutation.isPending}
                  data-testid="button-bulk-restore-areas"
                >
                  {bulkRestoreAreasMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Restore Selected
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedAreas(new Set())}>
                  Clear
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setBulkDeleteAreasOpen(true)}
                  disabled={bulkPermanentDeleteAreasMutation.isPending}
                  data-testid="button-bulk-delete-areas"
                >
                  {bulkPermanentDeleteAreasMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete Forever
                </Button>
              </div>
            )}

            {loadingAreas ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : deletedAreas.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Trash2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No deleted areas</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    checked={selectedAreas.size === deletedAreas.length && deletedAreas.length > 0}
                    onCheckedChange={selectAllAreas}
                    data-testid="checkbox-select-all-areas"
                  />
                  <span className="text-sm text-muted-foreground">Select all</span>
                </div>
                {deletedAreas.map((area) => (
                  <Card key={area.id} className="hover-elevate">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedAreas.has(area.id)}
                          onCheckedChange={() => toggleAreaSelection(area.id)}
                          data-testid={`checkbox-area-${area.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{area.name}</span>
                            {area.photoCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {area.photoCount} photos will restore
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                            <span>Project: {area.projectName}</span>
                            <span className="text-muted-foreground/50">|</span>
                            <span>
                              Deleted {area.deletedAt && formatDistanceToNow(new Date(area.deletedAt), { addSuffix: true })}
                            </span>
                            {area.deletedByName && (
                              <>
                                <span className="text-muted-foreground/50">|</span>
                                <span>by {area.deletedByName}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => restoreAreaMutation.mutate(area.id)}
                            disabled={restoreAreaMutation.isPending}
                            title="Restore"
                            data-testid={`button-restore-area-${area.id}`}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteAreaId(area.id)}
                            className="text-destructive hover:text-destructive"
                            title="Delete Forever"
                            data-testid={`button-delete-area-${area.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            {selectedPhotos.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
                <span className="text-sm font-medium">{selectedPhotos.size} selected</span>
                <Button
                  size="sm"
                  onClick={() => bulkRestorePhotosMutation.mutate(Array.from(selectedPhotos))}
                  disabled={bulkRestorePhotosMutation.isPending}
                  data-testid="button-bulk-restore-photos"
                >
                  {bulkRestorePhotosMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Restore Selected
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPhotos(new Set())}>
                  Clear
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setBulkDeletePhotosOpen(true)}
                  disabled={bulkPermanentDeletePhotosMutation.isPending}
                  data-testid="button-bulk-delete-photos"
                >
                  {bulkPermanentDeletePhotosMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete Forever
                </Button>
              </div>
            )}

            {loadingPhotos ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : deletedPhotos.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Trash2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No deleted photos</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    checked={selectedPhotos.size === deletedPhotos.length && deletedPhotos.length > 0}
                    onCheckedChange={selectAllPhotos}
                    data-testid="checkbox-select-all-photos"
                  />
                  <span className="text-sm text-muted-foreground">Select all</span>
                </div>
                {deletedPhotos.map((photo) => (
                  <Card key={photo.id} className="hover-elevate">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedPhotos.has(photo.id)}
                          onCheckedChange={() => togglePhotoSelection(photo.id)}
                          data-testid={`checkbox-photo-${photo.id}`}
                        />
                        <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          {photo.originalUrl ? (
                            <img
                              src={normalizeStorageUrl((photo as any).canonicalUrl || photo.originalUrl)}
                              alt={photo.filename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Image className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{buildPhotoExportName({
                              locationType: photo.interiorExterior,
                              seq: photo.id,
                              areaName: photo.areaName,
                            })}</span>
                            {photo.deletedByCascadeFromAreaId && (
                              <Badge variant="outline" className="text-xs">
                                Cascade delete
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                            <span>{photo.projectName}</span>
                            <span className="text-muted-foreground/50">/</span>
                            <span>{photo.areaName}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>
                              Deleted {photo.deletedAt && formatDistanceToNow(new Date(photo.deletedAt), { addSuffix: true })}
                            </span>
                            {photo.deletedByName && (
                              <span>by {photo.deletedByName}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => restorePhotoMutation.mutate(photo.id)}
                            disabled={restorePhotoMutation.isPending}
                            title="Restore"
                            data-testid={`button-restore-photo-${photo.id}`}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletePhotoId(photo.id)}
                            className="text-destructive hover:text-destructive"
                            title="Delete Forever"
                            data-testid={`button-delete-photo-${photo.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={deleteAreaId !== null}
          onOpenChange={(open) => !open && setDeleteAreaId(null)}
          title="Permanently Delete Area?"
          description={`This will permanently delete "${areaToDelete?.name}" and ${areaToDelete?.photoCount || 0} photos. This cannot be undone.`}
          confirmLabel="Delete Forever"
          variant="destructive"
          onConfirm={() => deleteAreaId && permanentDeleteAreaMutation.mutate(deleteAreaId)}
        />

        <ConfirmDialog
          open={deletePhotoId !== null}
          onOpenChange={(open) => !open && setDeletePhotoId(null)}
          title="Permanently Delete Photo?"
          description={`This will permanently delete "${photoToDelete?.filename}". This cannot be undone.`}
          confirmLabel="Delete Forever"
          variant="destructive"
          onConfirm={() => deletePhotoId && permanentDeletePhotoMutation.mutate(deletePhotoId)}
        />

        <ConfirmDialog
          open={bulkDeleteAreasOpen}
          onOpenChange={setBulkDeleteAreasOpen}
          title={`Permanently Delete ${selectedAreas.size} Areas?`}
          description="This will permanently delete all selected areas and their photos. This cannot be undone."
          confirmLabel="Delete Forever"
          variant="destructive"
          onConfirm={() => bulkPermanentDeleteAreasMutation.mutate(Array.from(selectedAreas))}
        />

        <ConfirmDialog
          open={bulkDeletePhotosOpen}
          onOpenChange={setBulkDeletePhotosOpen}
          title={`Permanently Delete ${selectedPhotos.size} Photos?`}
          description="This will permanently delete all selected photos. This cannot be undone."
          confirmLabel="Delete Forever"
          variant="destructive"
          onConfirm={() => bulkPermanentDeletePhotosMutation.mutate(Array.from(selectedPhotos))}
        />
      </div>
    </LayoutShell>
  );
}
