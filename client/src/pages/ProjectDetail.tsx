import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { ShareLayout } from "@/components/share-layout";
import { useProject, useRestoreProject } from "@/hooks/use-projects";
import { useAreas, useCreateArea, useDeleteArea, useRestoreDeletedArea, useBulkDeleteAreas } from "@/hooks/use-areas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ArrowLeft, Plus, MapPin, Loader2, Camera, Download, FileText, Archive, RotateCcw, Pencil, MoreVertical, Trash2, CheckSquare, X, Check, Share } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAreaSchema, AREA_LOCATION_TYPES } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { ShareProjectModal } from "@/components/ShareProjectModal";
import { useGuestOptional } from "@/lib/guest-context";
import { useShareContext } from "@/lib/share-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getShareHeaders } from "@/lib/share-fetch";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Project, Area } from "@shared/schema";

const formSchema = insertAreaSchema.pick({
  name: true,
  notes: true,
  locationType: true,
}).extend({
  locationType: z.enum(["Interior", "Exterior", "Vehicle"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const [, shareParams] = useRoute("/share/:linkId/project");
  const [location, navigate] = useLocation();
  
  const shareContext = useShareContext();
  const guestContext = useGuestOptional();
  
  const isShareMode = !!shareContext;
  const isGuest = !!guestContext?.guest;
  const isContributor = shareContext?.isContributor ?? false;
  
  const projectId = isShareMode 
    ? shareContext.projectId 
    : parseInt(params?.id || "0");
  const linkId = shareContext?.linkId || "";
  const shareHeaders = useMemo(() => isShareMode ? getShareHeaders(linkId) : {}, [isShareMode, linkId]);
  
  const { data: ownerProject, isLoading: ownerProjectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !isShareMode && projectId > 0,
  });
  const { data: shareProject, isLoading: shareProjectLoading } = useQuery<Project>({
    queryKey: ["/api/share", linkId, "project"],
    queryFn: async () => {
      const res = await fetch(`/api/share/${linkId}/project`, { headers: shareHeaders });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: isShareMode && !!linkId,
  });
  
  const project = isShareMode ? shareProject : ownerProject;
  const projectLoading = isShareMode ? shareProjectLoading : ownerProjectLoading;
  
  const { data: ownerAreas, isLoading: ownerAreasLoading } = useAreas(isShareMode ? 0 : projectId);
  const { data: shareAreas, isLoading: shareAreasLoading } = useQuery<Area[]>({
    queryKey: ["/api/share", linkId, "areas"],
    queryFn: async () => {
      const res = await fetch(`/api/share/${linkId}/areas`, { headers: shareHeaders });
      if (!res.ok) throw new Error("Failed to fetch areas");
      return res.json();
    },
    enabled: isShareMode && !!linkId,
  });
  
  const areas = isShareMode ? shareAreas : ownerAreas;
  const areasLoading = isShareMode ? shareAreasLoading : ownerAreasLoading;
  
  const { mutate: ownerCreateArea, isPending: ownerCreating } = useCreateArea(projectId);
  const shareCreateAreaMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await fetch(`/api/share/${linkId}/areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...shareHeaders },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create area");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share", linkId, "areas"] });
    },
  });
  
  const isCreating = isShareMode ? shareCreateAreaMutation.isPending : ownerCreating;
  const { mutate: restoreProject, isPending: isRestoring } = useRestoreProject();
  const { mutate: ownerDeleteArea } = useDeleteArea();
  const { mutate: ownerRestoreArea } = useRestoreDeletedArea();
  const { mutate: bulkDeleteAreas, isPending: isBulkDeleting } = useBulkDeleteAreas();
  const { toast } = useToast();
  
  const shareDeleteAreaMutation = useMutation({
    mutationFn: async (areaId: number) => {
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
    mutationFn: async (areaId: number) => {
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
  
  const deleteArea = (areaId: number, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
    if (isShareMode) {
      shareDeleteAreaMutation.mutate(areaId, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    } else {
      ownerDeleteArea(areaId, options);
    }
  };
    
  const restoreArea = (areaId: number) => {
    if (isShareMode) {
      shareRestoreAreaMutation.mutate(areaId);
    } else {
      ownerRestoreArea(areaId);
    }
  };
  
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<Set<number>>(new Set());
  const [deleteAreaId, setDeleteAreaId] = useState<number | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Guest export state
  const [guestExportId, setGuestExportId] = useState<number | null>(null);
  const [guestExportStatus, setGuestExportStatus] = useState<'idle' | 'starting' | 'generating' | 'ready' | 'error'>('idle');
  const [guestExportProgress, setGuestExportProgress] = useState(0);
  
  // Async PDF export state
  const [pdfExportJobId, setPdfExportJobId] = useState<string | null>(null);
  const [pdfExportStatus, setPdfExportStatus] = useState<'idle' | 'starting' | 'running' | 'complete' | 'error'>('idle');
  const [pdfExportProgress, setPdfExportProgress] = useState(0);
  const [pdfExportMessage, setPdfExportMessage] = useState<string>('');
  
  const isArchived = project?.status === 'archived';
  const areaToDelete = areas?.find(a => a.id === deleteAreaId);
  
  // Guest export polling
  useEffect(() => {
    const linkId = guestContext?.guest?.linkId;
    if (!guestExportId || !linkId) return;
    if (guestExportStatus !== 'generating' && guestExportStatus !== 'starting') return;
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/guest/${linkId}/exports/${guestExportId}`);
        if (response.ok) {
          const exportData = await response.json();
          if (exportData.status === 'ready') {
            setGuestExportStatus('ready');
            setGuestExportProgress(100);
            clearInterval(pollInterval);
          } else if (exportData.status === 'error') {
            setGuestExportStatus('error');
            clearInterval(pollInterval);
            toast({ title: "Export failed", description: exportData.errorMessage || "An error occurred", variant: "destructive" });
          } else {
            setGuestExportProgress(prev => Math.min(prev + 10, 90));
          }
        }
      } catch (err) {
        console.error('Export poll error:', err);
      }
    }, 2000);
    
    return () => clearInterval(pollInterval);
  }, [guestExportId, guestExportStatus, guestContext?.guest?.linkId, toast]);
  
  const handleGuestExport = useCallback(async () => {
    const linkId = guestContext?.guest?.linkId;
    if (!linkId) return;
    
    setGuestExportStatus('starting');
    setGuestExportProgress(5);
    
    try {
      const response = await apiRequest('POST', `/api/guest/${linkId}/export/photos-zip`);
      const exportData = await response.json();
      setGuestExportId(exportData.id);
      setGuestExportStatus('generating');
      setGuestExportProgress(20);
    } catch (err) {
      console.error('Guest export error:', err);
      setGuestExportStatus('error');
      toast({ title: "Export failed", description: "Could not start the export", variant: "destructive" });
    }
  }, [guestContext?.guest?.linkId, toast]);
  
  const handleGuestDownload = useCallback(() => {
    const linkId = guestContext?.guest?.linkId;
    if (!linkId || !guestExportId) return;
    
    window.open(`/api/guest/${linkId}/exports/${guestExportId}/download`, '_blank');
    // Reset state after download
    setTimeout(() => {
      setGuestExportId(null);
      setGuestExportStatus('idle');
      setGuestExportProgress(0);
    }, 1000);
  }, [guestContext?.guest?.linkId, guestExportId]);
  
  // Async PDF export polling
  useEffect(() => {
    if (!pdfExportJobId) return;
    if (pdfExportStatus !== 'starting' && pdfExportStatus !== 'running') return;
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/export-jobs/${pdfExportJobId}/status`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'complete') {
            setPdfExportStatus('complete');
            setPdfExportProgress(100);
            setPdfExportMessage('PDF ready for download!');
            clearInterval(pollInterval);
          } else if (data.status === 'failed') {
            setPdfExportStatus('error');
            setPdfExportMessage(data.error || 'Export failed');
            clearInterval(pollInterval);
            toast({ title: "PDF export failed", description: data.error || "An error occurred", variant: "destructive" });
          } else {
            setPdfExportStatus('running');
            setPdfExportProgress(data.progress || 0);
            setPdfExportMessage(data.progressMessage || 'Processing...');
          }
        }
      } catch (err) {
        console.error('PDF export poll error:', err);
      }
    }, 1500);
    
    return () => clearInterval(pollInterval);
  }, [pdfExportJobId, pdfExportStatus, toast]);
  
  const handleStartPdfExport = useCallback(async (qualityMode: "high" | "compact" = "high") => {
    setPdfExportStatus('starting');
    setPdfExportProgress(0);
    setPdfExportMessage('Starting PDF export...');
    
    try {
      const response = await apiRequest('POST', `/api/projects/${projectId}/export/pdf/start?qualityMode=${qualityMode}`);
      const data = await response.json();
      if (data.jobId) {
        setPdfExportJobId(data.jobId);
        setPdfExportStatus('running');
        setPdfExportMessage('Export in progress...');
      } else {
        throw new Error('No job ID returned');
      }
    } catch (err: any) {
      console.error('PDF export start error:', err);
      setPdfExportStatus('error');
      setPdfExportMessage('');
      toast({ title: "PDF export failed", description: err.message || "Could not start the export", variant: "destructive" });
    }
  }, [projectId, toast]);
  
  const handleDownloadPdf = useCallback(() => {
    if (!pdfExportJobId) return;
    
    window.open(`/api/export-jobs/${pdfExportJobId}/download`, '_blank');
    // Reset state after download
    setTimeout(() => {
      setPdfExportJobId(null);
      setPdfExportStatus('idle');
      setPdfExportProgress(0);
      setPdfExportMessage('');
    }, 1000);
  }, [pdfExportJobId]);

  const toggleAreaSelection = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newSet = new Set(selectedAreas);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAreas(newSet);
  };

  const handleDeleteArea = (areaId: number, areaName: string) => {
    deleteArea(areaId, {
      onSuccess: () => {
        setDeleteAreaId(null);
        toast({
          title: "Area deleted",
          description: `"${areaName}" moved to trash`,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
                restoreArea(areaId);
              }}
            >
              Undo
            </Button>
          ),
        });
        undoTimeoutRef.current = setTimeout(() => {}, 10000);
      },
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedAreas);
    bulkDeleteAreas(ids, {
      onSuccess: () => {
        setBulkDeleteDialogOpen(false);
        const count = ids.length;
        setSelectedAreas(new Set());
        setSelectMode(false);
        toast({
          title: `${count} area${count > 1 ? 's' : ''} deleted`,
          description: "Items moved to trash",
        });
      },
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedAreas(new Set());
  };

  const handleRestore = () => {
    if (!project) return;
    restoreProject(projectId, {
      onSuccess: () => {
        toast({
          title: "Project restored",
          description: `"${project.siteName}" is now active and editable.`,
        });
      },
      onError: (err) => {
        toast({
          title: "Failed to restore",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      notes: "",
      locationType: "Interior",
    },
  });

  const onSubmit = (data: FormValues) => {
    if (isShareMode) {
      shareCreateAreaMutation.mutate(data, {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      });
    } else {
      ownerCreateArea(data, {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      });
    }
  };

  if (projectLoading || !project) {
    const LoadingContent = (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
    
    if (isShareMode) {
      return (
        <ShareLayout linkId={linkId} projectName="Loading..." role={shareContext?.role || "viewer"}>
          {LoadingContent}
        </ShareLayout>
      );
    }
    
    return <LayoutShell>{LoadingContent}</LayoutShell>;
  }
  
  const pageContent = (
    <>
      {isArchived && (
        <div className="mb-6 bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Archive className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">This project is archived</p>
              <p className="text-sm text-muted-foreground">It is read-only. Restore to make changes.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestore}
            disabled={isRestoring}
            data-testid="button-restore-project"
          >
            {isRestoring ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            Restore
          </Button>
        </div>
      )}

      <div className="mb-6 space-y-4">
        {!isGuest && !isShareMode && (
          <Link href={isArchived ? "/archive" : "/"} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" /> {isArchived ? "Back to Archive" : "Back to Projects"}
          </Link>
        )}
        
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-display font-bold text-foreground">{project.siteName}</h1>
              {!isArchived && !isGuest && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditOpen(true)}
                  data-testid="button-edit-project"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm font-mono">{project.surveyId}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {project.address || "No address"}</span>
            </div>
          </div>
          
          <div className="hidden md:flex gap-2">
            {!isArchived && !isGuest && !isShareMode && (
              <>
                <ShareProjectModal projectId={projectId} projectName={project.siteName} />
                <Button 
                  variant="outline"
                  onClick={() => window.open(`/api/projects/${projectId}/export/xlsx`, '_blank')}
                  data-testid="button-export-xlsx"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Excel
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.open(`/api/projects/${projectId}/export/csv`, '_blank')}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                {pdfExportStatus === 'idle' && (
                  <Button 
                    variant="outline"
                    onClick={() => handleStartPdfExport("high")}
                    data-testid="button-export-pdf"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                )}
                {(pdfExportStatus === 'starting' || pdfExportStatus === 'running') && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-md">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Generating PDF...</span>
                      <span className="text-xs text-muted-foreground">{pdfExportMessage || `${pdfExportProgress}%`}</span>
                    </div>
                    <Progress value={pdfExportProgress} className="w-20" />
                  </div>
                )}
                {pdfExportStatus === 'complete' && (
                  <Button 
                    variant="default"
                    onClick={handleDownloadPdf}
                    data-testid="button-download-pdf"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                )}
                {pdfExportStatus === 'error' && (
                  <Button 
                    variant="outline"
                    onClick={() => handleStartPdfExport("high")}
                    data-testid="button-retry-pdf"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Retry PDF
                  </Button>
                )}
              </>
            )}
            {/* Share mode contributors don't see exports - only the add area button */}
            {isGuest && !isShareMode ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  {guestExportStatus === 'idle' && (
                    <Button 
                      variant="outline"
                      onClick={handleGuestExport}
                      data-testid="button-download-photos"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Photos
                    </Button>
                  )}
                  {(guestExportStatus === 'starting' || guestExportStatus === 'generating') && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Preparing download...</span>
                      <Progress value={guestExportProgress} className="w-24" />
                    </div>
                  )}
                  {guestExportStatus === 'ready' && (
                    <Button 
                      variant="default"
                      onClick={handleGuestDownload}
                      data-testid="button-download-ready"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Download Ready
                    </Button>
                  )}
                  {guestExportStatus === 'error' && (
                    <Button 
                      variant="outline"
                      onClick={handleGuestExport}
                      data-testid="button-retry-download"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Retry Download
                    </Button>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">Downloads billed to project owner</span>
              </div>
            ) : null}
            {!isArchived && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-accent text-accent-foreground">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Area
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Area</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Area Name</FormLabel>
                            <FormControl>
                              <Input placeholder="North Elevation, Lobby, etc." {...field} data-testid="input-area-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="locationType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-location-type">
                                  <SelectValue placeholder="Select location type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Interior" data-testid="option-interior">Interior</SelectItem>
                                <SelectItem value="Exterior" data-testid="option-exterior">Exterior</SelectItem>
                                <SelectItem value="Vehicle" data-testid="option-vehicle">Vehicle</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Keycode: 1234" {...field} value={field.value || ""} data-testid="input-area-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={isCreating} data-testid="button-create-area">
                        {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Create Area
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {project && !isGuest && (
        <EditProjectDialog
          project={project}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <ConfirmDialog
        open={deleteAreaId !== null}
        onOpenChange={(open) => !open && setDeleteAreaId(null)}
        title="Delete Area"
        description={`This will delete "${areaToDelete?.name}" and all photos inside it. You can restore it from the Trash.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => areaToDelete && handleDeleteArea(areaToDelete.id, areaToDelete.name)}
      />

      <ConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title={`Delete ${selectedAreas.size} areas?`}
        description="This will delete the selected areas and all their photos. You can restore them from the Trash."
        confirmLabel="Delete All"
        variant="destructive"
        onConfirm={handleBulkDelete}
      />

      {/* Select mode action bar - available for both owner and contributor */}
      {selectMode && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
          <span className="text-sm font-medium">{selectedAreas.size} selected</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteDialogOpen(true)}
            disabled={selectedAreas.size === 0 || isBulkDeleting}
            data-testid="button-bulk-delete-areas"
          >
            {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={exitSelectMode}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {!isArchived && areas && areas.length > 0 && !selectMode && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} data-testid="button-select-areas">
              <CheckSquare className="w-4 h-4 mr-2" />
              Select
            </Button>
          </div>
        )}
        {areasLoading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-xl border border-border" />)
        ) : areas?.length === 0 ? (
          <div className="text-center py-12 bg-muted/5 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground">No areas defined yet.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Add an area to start taking photos.</p>
          </div>
        ) : (
          areas?.map((area) => (
            <div key={area.id} className="relative">
              {selectMode ? (
                <Card 
                  className={`transition-all duration-200 cursor-pointer bg-card/60 backdrop-blur-sm ${selectedAreas.has(area.id) ? 'ring-2 ring-primary' : ''}`}
                  onClick={(e) => toggleAreaSelection(area.id, e)}
                >
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Checkbox 
                        checked={selectedAreas.has(area.id)} 
                        data-testid={`checkbox-area-${area.id}`}
                      />
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground">{area.name}</h3>
                        {area.notes && <p className="text-sm text-muted-foreground">{area.notes}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Link href={isShareMode ? `/share/${linkId}/area/${area.id}` : `/areas/${area.id}`}>
                  <Card className="hover:border-primary/50 transition-all duration-200 cursor-pointer group bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                          <Camera className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground">{area.name}</h3>
                          {area.notes && <p className="text-sm text-muted-foreground">{area.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(!isShareMode || shareContext?.role === "contributor") && !isArchived && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                              <Button variant="ghost" size="icon" data-testid={`button-area-menu-${area.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setDeleteAreaId(area.id);
                                }}
                                data-testid={`menu-delete-area-${area.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Area
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
  
  if (isShareMode) {
    return (
      <ShareLayout linkId={linkId} projectName={project.siteName} role={shareContext?.role || "viewer"}>
        {pageContent}
      </ShareLayout>
    );
  }
  
  return (
    <LayoutShell
      title={project.clientName || project.siteName}
      action={
        !isArchived ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" className="rounded-full bg-accent text-accent-foreground">
                <Plus className="w-6 h-6" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Area</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Area Name</FormLabel>
                        <FormControl>
                          <Input placeholder="North Elevation, Lobby, etc." {...field} data-testid="input-area-name-mobile" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="locationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-location-type-mobile">
                              <SelectValue placeholder="Select location type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Interior">Interior</SelectItem>
                            <SelectItem value="Exterior">Exterior</SelectItem>
                            <SelectItem value="Vehicle">Vehicle</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Keycode: 1234" {...field} value={field.value || ""} data-testid="input-area-notes-mobile" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isCreating} data-testid="button-create-area-mobile">
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Create Area
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {pageContent}
    </LayoutShell>
  );
}
