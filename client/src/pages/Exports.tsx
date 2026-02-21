import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { useActiveProjects } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import { 
  showNotification, 
  updateNotification, 
  dismissNotification 
} from "@/hooks/use-notification-manager";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { FileText, FileSpreadsheet, Download, Loader2, Calendar, Clock, ImageIcon, FolderTree, Archive, RefreshCw, Package, Trash2, AlertCircle, Eye, EyeOff, Cloud, Zap, Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Export, ExportSession, Photo, PlanTier } from "@shared/schema";
import { PLAN_CAPS } from "@shared/schema";
import { runExportSession, waitForSessionReady, type ExportProgress } from "@/lib/export-session";
import { JobStatus, type JobStatusType } from "@/components/job-status";
import { ProcessingBanner } from "@/components/processing-banner";
import { focusExportRow } from "@/lib/focus-export-row";
import { 
  shouldShowTerminalToast, 
  markAsNotified, 
  initializeFromExports 
} from "@/lib/terminal-toast-guard";

export default function Exports() {
  const { data: projects, isLoading: projectsLoading } = useActiveProjects();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  
  const [photoExportType, setPhotoExportType] = useState<"annotated" | "clean">("annotated");
  const [organizeByArea, setOrganizeByArea] = useState(true);
  
  const [fullExportProgress, setFullExportProgress] = useState<ExportProgress | null>(null);
  const [isFullExporting, setIsFullExporting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Async PDF export state
  const [pdfExportJobId, setPdfExportJobId] = useState<number | null>(null);
  const [pdfExportStatus, setPdfExportStatus] = useState<'idle' | 'starting' | 'running' | 'complete' | 'error'>('idle');
  const [pdfExportProgress, setPdfExportProgress] = useState(0);
  const [pdfExportMessage, setPdfExportMessage] = useState<string>('');
  
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [expandedErrorIds, setExpandedErrorIds] = useState<Set<number>>(new Set());
  const [projectSelectOpen, setProjectSelectOpen] = useState(false);
  const exportsListLoaded = useRef(false);

  // Query key for exports - must be consistent for invalidation
  const exportsQueryKey = selectedProject ? ['exports', selectedProject] : ['exports'];
  const sessionsQueryKey = selectedProject ? ['export-sessions', selectedProject] : ['export-sessions'];

  // Custom fetch function with cache-busting
  const fetchExportsWithCacheBust = useCallback(async (): Promise<Export[]> => {
    if (!selectedProject) return [];
    const url = `/api/projects/${selectedProject}/exports?t=${Date.now()}`;
    console.log('[Exports] Fetching exports:', url);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log('[Exports] Received exports:', data.length, 'items');
      setFetchError(null);
      // Sort by createdAt desc
      return (data as Export[]).sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch exports';
      console.error('[Exports] Fetch error:', message);
      setFetchError(message);
      throw err;
    }
  }, [selectedProject]);

  const { data: exportHistory, isLoading: historyLoading, refetch: refetchHistory, error: historyError } = useQuery<Export[]>({
    queryKey: exportsQueryKey,
    queryFn: fetchExportsWithCacheBust,
    enabled: !!selectedProject,
    staleTime: 0, // Always consider data stale
  });

  // Check if any exports are still generating (for polling) - must be after useQuery
  const hasGeneratingExports = (exportHistory ?? []).some(e => e.status === 'generating' || e.status === 'pending');
  
  // Count of active (queued/running) exports for the banner
  const activeExportCount = useMemo(() => {
    return (exportHistory ?? []).filter(e => 
      e.status === 'generating' || e.status === 'pending' || e.status === 'queued' || e.status === 'running'
    ).length;
  }, [exportHistory]);

  // Track previous export statuses to detect transitions (for notifications)
  const prevExportStatusesRef = useRef<Map<number, string>>(new Map());
  
  // Initialize terminal toast guard from existing exports (on first load)
  useEffect(() => {
    if (exportHistory && exportHistory.length > 0 && !exportsListLoaded.current) {
      initializeFromExports(exportHistory);
      exportsListLoaded.current = true;
    }
  }, [exportHistory]);
  
  // Listen for expand-export-error events from focusExportRow
  useEffect(() => {
    const handleExpandError = (event: CustomEvent<{ exportId: number; expanded: boolean }>) => {
      const { exportId, expanded } = event.detail;
      setExpandedErrorIds(prev => {
        const next = new Set(prev);
        if (expanded) {
          next.add(exportId);
        } else {
          next.delete(exportId);
        }
        return next;
      });
    };
    
    window.addEventListener("expand-export-error", handleExpandError as EventListener);
    return () => {
      window.removeEventListener("expand-export-error", handleExpandError as EventListener);
    };
  }, []);
  
  // Helper to enable "Show All Completed" for focusExportRow
  const enableShowAllCompleted = useCallback(() => {
    setShowAllCompleted(true);
  }, []);
  
  // Effect to show terminal toasts with deduplication guard
  useEffect(() => {
    if (!exportHistory) return;
    
    const prevStatuses = prevExportStatusesRef.current;
    
    for (const exp of exportHistory) {
      const prevStatus = prevStatuses.get(exp.id);
      const currentStatus = exp.status || 'unknown';
      
      const { shouldShow, toastType } = shouldShowTerminalToast(exp.id, currentStatus, prevStatus);
      
      if (shouldShow && toastType) {
        markAsNotified(exp.id, toastType);
        
        if (toastType === 'ready') {
          showNotification({
            id: `export:${exp.id}:done`,
            title: "Export ready",
            description: "Your export is ready for download.",
            type: "success",
            duration: 3000,
            actions: [
              { 
                label: "Download", 
                onClick: () => {
                  window.location.href = `/api/exports/${exp.id}/download`;
                  dismissNotification(`export:${exp.id}:done`);
                }
              },
              {
                label: "View in Exports",
                onClick: () => {
                  focusExportRow(exp.id, { expandError: false, enableShowAll: enableShowAllCompleted });
                  dismissNotification(`export:${exp.id}:done`);
                }
              },
            ],
          });
        } else if (toastType === 'error') {
          showNotification({
            id: `export:${exp.id}:error`,
            title: "Export failed",
            description: exp.errorMessage || "An error occurred during export.",
            type: "error",
            actions: [
              { 
                label: "View Details", 
                onClick: () => {
                  focusExportRow(exp.id, { expandError: true, enableShowAll: enableShowAllCompleted });
                }
              },
              { label: "Dismiss", onClick: () => dismissNotification(`export:${exp.id}:error`) },
            ],
          });
        }
      }
      
      // Update tracked status
      prevStatuses.set(exp.id, currentStatus);
    }
    
    prevExportStatusesRef.current = prevStatuses;
  }, [exportHistory, enableShowAllCompleted]);

  // Set up polling interval when there are generating exports
  useEffect(() => {
    if (!hasGeneratingExports || !selectedProject) return;
    
    console.log('[Exports] Starting poll interval for generating exports');
    const pollInterval = setInterval(() => {
      console.log('[Exports] Polling for updates...');
      refetchHistory();
    }, 2500);
    
    return () => {
      console.log('[Exports] Stopping poll interval');
      clearInterval(pollInterval);
    };
  }, [hasGeneratingExports, selectedProject, refetchHistory]);
  
  // Fetch sessions with cache-busting
  const fetchSessionsWithCacheBust = useCallback(async (): Promise<ExportSession[]> => {
    if (!selectedProject) return [];
    const url = `/api/projects/${selectedProject}/export-sessions?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch sessions');
    return response.json();
  }, [selectedProject]);

  const { data: exportSessions, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<ExportSession[]>({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessionsWithCacheBust,
    enabled: !!selectedProject,
    staleTime: 0,
  });

  const { data: projectPhotos } = useQuery<Photo[]>({
    queryKey: ['project-photos', selectedProject],
    enabled: !!selectedProject && isFullExporting,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${selectedProject}/photos?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error("Failed to get photos");
      return response.json();
    },
  });

  // Plan info query for usage limits
  interface PlanInfo {
    organizationId: number;
    plan: PlanTier;
    baseCaps: typeof PLAN_CAPS[PlanTier];
    effectiveLimits: {
      monthlyExports: number;
      storageBytes: number;
      activeGuestLinks: number;
      allowedExportTypes: string[];
      branding: string;
      cloudSync: boolean;
      addons: {
        guestLinksMode: string;
        guestLinksQty: number;
        storageTier: string;
        exportsTier: string;
        isActive: boolean;
      };
    };
    usage: {
      storageUsedBytes: number;
      storageCapBytes: number;
      storagePercent: number;
      exportsThisMonth: number;
      exportsCapMonthly: number;
      exportsPercent: number;
      activeGuestLinks: number;
      guestLinksCap: number;
      guestLinksPercent: number;
    };
    branding: {
      type: string;
      businessName: string | null;
      phone: string | null;
      email: string | null;
      website: string | null;
      address: string | null;
      logoUrl: string | null;
    };
  }

  const { data: planInfo, refetch: refetchPlanInfo } = useQuery<PlanInfo>({
    queryKey: ['/api/plan'],
    staleTime: 30000,
  });
  
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
            setExportingPdf(false);
            clearInterval(pollInterval);
            refetchPlanInfo();
          } else if (data.status === 'failed') {
            setPdfExportStatus('error');
            setPdfExportMessage(data.error || 'Export failed');
            setExportingPdf(false);
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
  }, [pdfExportJobId, pdfExportStatus, toast, refetchPlanInfo]);

  // Derived plan state
  const isStarterPlan = planInfo?.plan === 'starter';
  const canExportPdf = !isStarterPlan;
  const canExportExcel = !isStarterPlan;
  const exportsRemaining = planInfo ? planInfo.effectiveLimits.monthlyExports - planInfo.usage.exportsThisMonth : null;
  const isAtExportLimit = exportsRemaining !== null && exportsRemaining <= 0;

  // Delete export mutation
  const deleteExportMutation = useMutation({
    mutationFn: async (exportId: number) => {
      const response = await apiRequest("DELETE", `/api/exports/${exportId}`);
      if (!response.ok) throw new Error("Failed to delete export");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Export deleted" });
      queryClient.invalidateQueries({ queryKey: exportsQueryKey });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Delete failed";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    },
  });

  // Cloud sync: check for ready integrations
  const { data: readyIntegrations } = useQuery<Array<{ provider: string; accountEmail: string; selectedFolderDisplayPath: string }>>({
    queryKey: ['/api/integrations/ready'],
    staleTime: 30000,
  });

  // Cloud sync mutation
  const cloudSyncMutation = useMutation({
    mutationFn: async (exportId: number) => {
      const response = await apiRequest("POST", `/api/integrations/sync-export/${exportId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Sync failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Cloud Sync", description: data.message });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Sync failed";
      toast({ title: "Cloud Sync Failed", description: message, variant: "destructive" });
    },
  });

  const photoExportMutation = useMutation({
    mutationFn: async (opts: { projectId: number; includeAnnotations: boolean; organizeByArea: boolean }) => {
      const response = await apiRequest("POST", `/api/projects/${opts.projectId}/export/photos`, {
        includeAnnotations: opts.includeAnnotations,
        organizeByArea: opts.organizeByArea,
      });
      return response.json();
    },
    onMutate: async (opts) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: exportsQueryKey });
      
      // Snapshot the previous value
      const previousExports = queryClient.getQueryData<Export[]>(exportsQueryKey);
      
      // Optimistically add a new "generating" export
      const optimisticExport: Export = {
        id: Date.now(), // Temporary ID
        projectId: opts.projectId,
        type: opts.includeAnnotations ? 'PHOTOS_ANNOTATED_ZIP' : 'PHOTOS_CLEAN_ZIP',
        fileUrl: null,
        status: 'generating',
        createdAt: new Date(),
        createdBy: null,
        photoCount: null,
        includeAnnotations: opts.includeAnnotations,
        organizeByArea: opts.organizeByArea,
        errorMessage: null,
      };
      
      queryClient.setQueryData<Export[]>(exportsQueryKey, (old) => {
        const newList = [optimisticExport, ...(old ?? [])];
        console.log('[Exports] Optimistic update, new list length:', newList.length);
        return newList;
      });
      
      // NO toast on start - inline UI is the source of truth
      return { previousExports, tempId: optimisticExport.id };
    },
    onSuccess: (data, _vars, context) => {
      console.log('[Exports] Export created successfully:', data);
      // NO toast here - terminal toasts handled by polling effect
      // Invalidate and refetch to get the real export with correct ID
      queryClient.invalidateQueries({ queryKey: exportsQueryKey });
      // Refetch plan info to update export count
      refetchPlanInfo();
    },
    onError: (error, _vars, context) => {
      console.error('[Exports] Export creation failed:', error);
      // Rollback on error
      if (context?.previousExports) {
        queryClient.setQueryData(exportsQueryKey, context.previousExports);
      }
      
      // Show error toast for immediate API failure (not a terminal state from backend)
      const message = error instanceof Error ? error.message : 'Export failed';
      showNotification({
        id: `export:api-error:${Date.now()}`,
        title: "Export request failed",
        description: message,
        type: "error",
        actions: [
          { label: "Dismiss", onClick: () => dismissNotification(`export:api-error:${Date.now()}`) },
        ],
      });
    },
  });

  const handleExportPhotos = () => {
    if (!selectedProject) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    photoExportMutation.mutate({
      projectId: parseInt(selectedProject),
      includeAnnotations: photoExportType === "annotated",
      organizeByArea,
    });
  };

  const handleDownloadExport = async (exportId: number) => {
    try {
      const response = await fetch(`/api/exports/${exportId}/download`);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `export-${exportId}.zip`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({ title: "Download started" });
    } catch (error) {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleExportPdf = useCallback(async () => {
    if (!selectedProject) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    
    setExportingPdf(true);
    setPdfExportStatus('starting');
    setPdfExportProgress(0);
    setPdfExportMessage('Starting PDF export...');
    
    try {
      const response = await apiRequest('POST', `/api/projects/${selectedProject}/export/pdf/start?qualityMode=high`);
      const data = await response.json();
      if (data.jobId) {
        setPdfExportJobId(data.jobId);
        setPdfExportStatus('running');
        setPdfExportMessage('Export in progress...');
      } else {
        throw new Error(data.message || 'No job ID returned');
      }
    } catch (err: any) {
      console.error('PDF export start error:', err);
      setPdfExportStatus('error');
      setPdfExportMessage('');
      setExportingPdf(false);
      toast({ title: "PDF export failed", description: err.message || "Could not start the export", variant: "destructive" });
    }
  }, [selectedProject, toast]);
  
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

  const handleExportCsv = async () => {
    if (!selectedProject) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    
    setExportingCsv(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject}/export/csv`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${selectedProject}-data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({ title: "CSV exported successfully" });
    } catch (error) {
      toast({ title: "Export failed", description: "Could not generate CSV", variant: "destructive" });
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!selectedProject) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    
    setExportingXlsx(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject}/export/xlsx`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${selectedProject}-data.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({ title: "Excel exported successfully" });
      refetchPlanInfo(); // Update export count
    } catch (error) {
      toast({ title: "Export failed", description: "Could not generate Excel file", variant: "destructive" });
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleFullExport = useCallback(async () => {
    if (!selectedProject) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    
    setIsFullExporting(true);
    setFullExportProgress(null);
    
    // NO "started" toast - progress is shown inline
    
    try {
      const photosResponse = await fetch(`/api/projects/${selectedProject}/photos`);
      if (!photosResponse.ok) throw new Error("Failed to get photos");
      const photos: Photo[] = await photosResponse.json();
      
      if (photos.length === 0) {
        toast({ title: "No photos to export", variant: "destructive" });
        setIsFullExporting(false);
        return;
      }
      
      const { sessionId, baseName } = await runExportSession(
        parseInt(selectedProject),
        photos,
        setFullExportProgress
      );
      
      const result = await waitForSessionReady(sessionId);
      
      // Show success notification with download action
      showNotification({
        id: `fullexport:${sessionId}:done`,
        title: "Export complete!",
        description: `${baseName} is ready for download.`,
        type: "success",
        duration: 3000,
        actions: [
          { 
            label: "View Exports", 
            onClick: () => {
              refetchSessions();
              dismissNotification(`fullexport:${sessionId}:done`);
            }
          },
        ],
      });
      
      refetchSessions();
    } catch (error) {
      console.error("Full export failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      
      const errorId = `fullexport:error:${Date.now()}`;
      showNotification({
        id: errorId,
        title: "Export failed",
        description: message,
        type: "error",
        actions: [
          { label: "Dismiss", onClick: () => dismissNotification(errorId) },
        ],
      });
    } finally {
      setIsFullExporting(false);
    }
  }, [selectedProject, toast, refetchSessions]);

  const getExportProgressPercent = () => {
    if (!fullExportProgress) return 0;
    const total = fullExportProgress.totalPhotos * 2;
    const done = fullExportProgress.uploadedClean + fullExportProgress.uploadedAnnotated;
    return Math.round((done / total) * 100);
  };

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getExportTypeLabel = (type: string, includeAnnotations?: boolean | null) => {
    if (type === "PHOTOS_ANNOTATED_ZIP" || (type.includes("PHOTOS") && includeAnnotations)) {
      return "Photos (Annotated)";
    }
    if (type === "PHOTOS_CLEAN_ZIP" || type.includes("PHOTOS")) {
      return "Photos (Clean)";
    }
    if (type === "PDF") return "PDF Report";
    if (type === "CSV") return "CSV Data";
    return type;
  };

  const getStatusVariant = (status: string | null) => {
    switch (status) {
      case "ready": return "default";
      case "generating": return "secondary";
      case "pending": return "secondary";
      case "error": return "destructive";
      default: return "secondary";
    }
  };

  const getTypeIcon = (type: string) => {
    if (type.includes("PHOTOS")) return <ImageIcon className="w-5 h-5 text-blue-500" />;
    if (type === "PDF") return <FileText className="w-5 h-5 text-red-500" />;
    if (type === "CSV") return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
    return <Archive className="w-5 h-5" />;
  };
  
  // Filter and display exports: all active + last 5 ready (or all if showAllCompleted)
  const { visibleExports, hiddenReadyCount, totalReadyCount } = useMemo(() => {
    if (!exportHistory) return { visibleExports: [], hiddenReadyCount: 0, totalReadyCount: 0 };
    
    const active: Export[] = [];
    const ready: Export[] = [];
    
    for (const exp of exportHistory) {
      if (exp.status === 'ready') {
        ready.push(exp);
      } else {
        active.push(exp);
      }
    }
    
    // Ready exports are already sorted by createdAt DESC from the query
    const visibleReady = showAllCompleted ? ready : ready.slice(0, 5);
    const hiddenCount = ready.length - visibleReady.length;
    
    return {
      visibleExports: [...active, ...visibleReady],
      hiddenReadyCount: hiddenCount,
      totalReadyCount: ready.length,
    };
  }, [exportHistory, showAllCompleted]);

  return (
    <LayoutShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Exports</h1>
          <p className="text-muted-foreground">Generate and download project reports and photos</p>
        </div>
        {activeExportCount > 0 && (
          <ProcessingBanner count={activeExportCount} />
        )}
      </div>

      {/* Plan Usage Banner */}
      {planInfo && (
        <Card className="mb-6 bg-muted/30 border-border">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Badge variant={isStarterPlan ? "secondary" : "default"} className="capitalize">
                    {planInfo.plan} Plan
                  </Badge>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Exports this month: </span>
                  <span className={isAtExportLimit ? "text-destructive font-semibold" : "font-medium"}>
                    {planInfo.usage.exportsThisMonth} / {planInfo.effectiveLimits.monthlyExports}
                  </span>
                  {exportsRemaining !== null && exportsRemaining > 0 && exportsRemaining <= 5 && (
                    <span className="text-amber-600 dark:text-amber-500 ml-2">
                      ({exportsRemaining} remaining)
                    </span>
                  )}
                </div>
                {isStarterPlan && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Lock className="w-3.5 h-3.5" />
                    <span>ZIP exports only</span>
                  </div>
                )}
              </div>
              {isStarterPlan && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.href = '/billing'}
                  data-testid="button-upgrade-plan"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Upgrade for PDF + Excel
                </Button>
              )}
            </div>
            {isAtExportLimit && (
              <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>Monthly export limit reached. Upgrade your plan for more exports.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <Label className="text-base font-medium mb-2 block">Select Project</Label>
        <Popover open={projectSelectOpen} onOpenChange={setProjectSelectOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={projectSelectOpen}
              className="w-full max-w-md justify-between"
              data-testid="select-project-main"
            >
              {selectedProject
                ? (() => {
                    const project = projects?.find(p => p.id.toString() === selectedProject);
                    return project 
                      ? `${project.clientName} - ${project.siteName} (${project.surveyId || `#${project.id}`})`
                      : "Choose a project to export";
                  })()
                : "Choose a project to export"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full max-w-md p-0" align="start">
            <Command>
              <CommandInput placeholder="Search projects..." />
              <CommandList>
                <CommandEmpty>No project found.</CommandEmpty>
                <CommandGroup>
                  {projects
                    ?.slice()
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .map((project) => (
                    <CommandItem
                      key={project.id}
                      value={`${project.clientName} ${project.siteName} ${project.surveyId || project.id}`}
                      onSelect={() => {
                        setSelectedProject(project.id.toString());
                        setProjectSelectOpen(false);
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          selectedProject === project.id.toString() ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      {project.clientName} - {project.siteName} ({project.surveyId || `#${project.id}`})
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Full Export - WYSIWYG */}
      <Card className="bg-card border-border mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Full Export
            <Badge variant="secondary" className="ml-2">Recommended</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a complete export package with Clean ZIP, Annotated ZIP, PDF Report, and CSV manifest. 
            Annotations are rendered exactly as they appear in the editor (WYSIWYG).
          </p>
          
          {isFullExporting && fullExportProgress && (
            <div className="space-y-2">
              <Progress value={getExportProgressPercent()} className="h-2" />
              <p className="text-sm text-muted-foreground">{fullExportProgress.message}</p>
            </div>
          )}
          
          <Button 
            className="w-full" 
            onClick={handleFullExport}
            disabled={isFullExporting || !selectedProject}
            data-testid="button-full-export"
          >
            {isFullExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Package className="w-4 h-4 mr-2" />
            )}
            {isFullExporting ? "Exporting..." : "Generate Full Export"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              Export Photos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Download project photos as a ZIP file with optional annotations burned in.
            </p>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">Photo Type</Label>
                <RadioGroup value={photoExportType} onValueChange={(v) => setPhotoExportType(v as "annotated" | "clean")} className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="annotated" id="annotated" data-testid="radio-annotated" />
                    <Label htmlFor="annotated" className="cursor-pointer">
                      <span className="font-medium">With Annotations</span>
                      <p className="text-xs text-muted-foreground">Lines, shapes, and measurements burned into images</p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="clean" id="clean" data-testid="radio-clean" />
                    <Label htmlFor="clean" className="cursor-pointer">
                      <span className="font-medium">Without Annotations</span>
                      <p className="text-xs text-muted-foreground">Original clean images only</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="organize-by-area" className="text-sm cursor-pointer">
                    Organize by Area
                  </Label>
                </div>
                <Switch 
                  id="organize-by-area" 
                  checked={organizeByArea} 
                  onCheckedChange={setOrganizeByArea}
                  data-testid="switch-organize-area"
                />
              </div>
            </div>
            
            <Button 
              className="w-full" 
              onClick={handleExportPhotos}
              disabled={photoExportMutation.isPending || !selectedProject}
              data-testid="button-export-photos"
            >
              {photoExportMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              Generate Photo Export
            </Button>
          </CardContent>
        </Card>

        <Card className={`bg-card border-border ${isStarterPlan ? 'opacity-75' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              PDF Report
              {isStarterPlan && (
                <Badge variant="outline" className="ml-2 text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  Pro+
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a professional PDF report with all project photos, annotations, and metadata.
              Large projects may export as multiple PDFs in a ZIP file.
            </p>
            
            {(pdfExportStatus === 'starting' || pdfExportStatus === 'running') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm">{pdfExportMessage}</span>
                </div>
                <Progress value={pdfExportProgress} className="w-full" />
              </div>
            )}
            
            {isStarterPlan ? (
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => window.location.href = '/billing'}
                data-testid="button-upgrade-pdf"
              >
                <Zap className="w-4 h-4 mr-2" />
                Upgrade to Export PDF
              </Button>
            ) : pdfExportStatus === 'idle' ? (
              <Button 
                className="w-full" 
                onClick={handleExportPdf}
                disabled={exportingPdf || !selectedProject || isAtExportLimit}
                data-testid="button-export-pdf"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            ) : pdfExportStatus === 'starting' || pdfExportStatus === 'running' ? (
              <Button 
                className="w-full" 
                disabled
                data-testid="button-export-pdf-running"
              >
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </Button>
            ) : pdfExportStatus === 'complete' ? (
              <Button 
                className="w-full" 
                onClick={handleDownloadPdf}
                data-testid="button-download-pdf"
              >
                <Check className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            ) : pdfExportStatus === 'error' ? (
              <Button 
                className="w-full" 
                variant="outline"
                onClick={handleExportPdf}
                data-testid="button-retry-pdf"
              >
                <FileText className="w-4 h-4 mr-2" />
                Retry PDF
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className={`bg-card border-border ${isStarterPlan ? 'opacity-75' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Excel Data
              {isStarterPlan && (
                <Badge variant="outline" className="ml-2 text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  Pro+
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export all project data with measurements and notes as a multi-sheet Excel file.
            </p>
            {isStarterPlan ? (
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => window.location.href = '/billing'}
                data-testid="button-upgrade-xlsx"
              >
                <Zap className="w-4 h-4 mr-2" />
                Upgrade to Export Excel
              </Button>
            ) : (
              <Button 
                className="w-full" 
                onClick={handleExportXlsx}
                disabled={exportingXlsx || !selectedProject || isAtExportLimit}
                data-testid="button-export-xlsx"
              >
                {exportingXlsx ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Export Excel
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
              CSV Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export basic project data as CSV for compatibility with older systems.
            </p>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={handleExportCsv}
              disabled={exportingCsv || !selectedProject}
              data-testid="button-export-csv"
            >
              {exportingCsv ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Export Sessions (Full Exports) */}
      {selectedProject && exportSessions && exportSessions.length > 0 && (
        <Card className="bg-card border-border mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Full Export Sessions
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchSessions()} disabled={sessionsLoading} data-testid="button-refresh-sessions">
              <RefreshCw className={`w-4 h-4 ${sessionsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {exportSessions.map((session) => (
                <div key={session.id} className="p-4 rounded-lg bg-muted/30" data-testid={`session-item-${session.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-foreground">{session.baseName}</p>
                    <Badge variant={getStatusVariant(session.status)}>
                      {session.status === "packaging" ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Packaging
                        </span>
                      ) : session.status === "uploading" ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Uploading
                        </span>
                      ) : session.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {formatDate(session.createdAt)} - {session.photoCount} photos
                  </p>
                  {session.status === "ready" && (
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => window.open(`/api/export-sessions/${session.id}/download/clean-zip`, "_blank")}
                        data-testid={`button-download-clean-${session.id}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Clean ZIP
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => window.open(`/api/export-sessions/${session.id}/download/annotated-zip`, "_blank")}
                        data-testid={`button-download-annotated-${session.id}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Annotated ZIP
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => window.open(`/api/export-sessions/${session.id}/download/pdf`, "_blank")}
                        data-testid={`button-download-pdf-${session.id}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        PDF
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => window.open(`/api/export-sessions/${session.id}/download/csv`, "_blank")}
                        data-testid={`button-download-csv-${session.id}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        CSV
                      </Button>
                    </div>
                  )}
                  {session.status === "error" && session.errorMessage && (
                    <p className="text-sm text-destructive">{session.errorMessage}</p>
                  )}
                  {(session.status === "packaging" || session.status === "error" || session.status === "uploading") && (
                    <div className="flex gap-2 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={async () => {
                          try {
                            await fetch(`/api/export-sessions/${session.id}/retry`, { method: "POST" });
                            toast({ title: "Retry started" });
                            refetchSessions();
                          } catch {
                            toast({ title: "Retry failed", variant: "destructive" });
                          }
                        }}
                        data-testid={`button-retry-${session.id}`}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Retry
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={async () => {
                          try {
                            await fetch(`/api/export-sessions/${session.id}`, { method: "DELETE" });
                            toast({ title: "Session deleted" });
                            refetchSessions();
                          } catch {
                            toast({ title: "Delete failed", variant: "destructive" });
                          }
                        }}
                        data-testid={`button-delete-${session.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-4" data-testid="export-history-header">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Export History
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedProject && totalReadyCount > 5 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAllCompleted(!showAllCompleted)}
                data-testid="button-toggle-show-all"
              >
                {showAllCompleted ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-1" />
                    Show Less
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-1" />
                    Show All ({totalReadyCount})
                  </>
                )}
              </Button>
            )}
            {selectedProject && (
              <Button variant="ghost" size="sm" onClick={() => refetchHistory()} disabled={historyLoading} data-testid="button-refresh-history">
                <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedProject ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Select a project to view export history.</p>
            </div>
          ) : historyError || fetchError ? (
            <div className="text-center py-8 text-destructive">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Failed to load exports</p>
              <p className="text-sm mt-2">{fetchError || (historyError instanceof Error ? historyError.message : 'Unknown error')}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchHistory()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : historyLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
            </div>
          ) : !exportHistory || exportHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No exports yet for this project.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleExports.map((item) => (
                <div 
                  key={item.id} 
                  className="p-3 rounded-lg bg-muted/30" 
                  data-testid={`export-item-${item.id}`}
                  data-export-id={item.id}
                  data-export-status={item.status}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      {getTypeIcon(item.type)}
                      <div>
                        <p className="font-medium text-foreground">
                          {getExportTypeLabel(item.type, item.includeAnnotations)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(item.createdAt)}
                          {item.photoCount && ` - ${item.photoCount} photos`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <JobStatus 
                        status={(item.status as JobStatusType) || "queued"}
                        errorMessage={item.errorMessage}
                        expandedByDefault={expandedErrorIds.has(item.id)}
                        onExpandChange={(expanded) => {
                          setExpandedErrorIds(prev => {
                            const next = new Set(prev);
                            if (expanded) {
                              next.add(item.id);
                            } else {
                              next.delete(item.id);
                            }
                            return next;
                          });
                        }}
                        onRetry={item.status === "error" ? () => {
                          photoExportMutation.mutate({
                            projectId: item.projectId,
                            includeAnnotations: item.includeAnnotations ?? false,
                            organizeByArea: item.organizeByArea ?? true,
                          });
                        } : undefined}
                        isRetrying={photoExportMutation.isPending}
                      />
                      {item.status === "ready" && (
                        <>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleDownloadExport(item.id)}
                            data-testid={`button-download-${item.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {readyIntegrations && readyIntegrations.length > 0 && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => cloudSyncMutation.mutate(item.id)}
                              disabled={cloudSyncMutation.isPending}
                              title={`Sync to ${readyIntegrations.map(i => i.provider).join(', ')}`}
                              data-testid={`button-cloud-sync-${item.id}`}
                            >
                              {cloudSyncMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Cloud className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="text-muted-foreground hover:text-destructive"
                            disabled={deleteExportMutation.isPending}
                            data-testid={`button-delete-export-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Export?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this export and its files from storage. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteExportMutation.mutate(item.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
              
              {hiddenReadyCount > 0 && !showAllCompleted && (
                <div className="text-center py-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowAllCompleted(true)}
                    data-testid="button-show-hidden-exports"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Show {hiddenReadyCount} more completed export{hiddenReadyCount > 1 ? 's' : ''}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </LayoutShell>
  );
}
