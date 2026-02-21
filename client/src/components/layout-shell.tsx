import { Link, useLocation } from "wouter";
import { useState, useRef, useCallback, useEffect } from "react";
import { FolderKanban, Settings, FileText, Users, CreditCard, Archive, Trash2, Link2, Eye, Edit, Camera, MoreHorizontal, Zap, Pencil, Search, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGuestOptional } from "@/lib/guest-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AreaWithProject {
  id: number;
  projectId: number;
  name: string;
  notes: string | null;
  locationType: string | null;
  projectName: string;
  clientName: string | null;
}

interface LayoutShellProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}

export function LayoutShell({ children, title, action }: LayoutShellProps) {
  const [location, setLocation] = useLocation();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [captureSheetOpen, setCaptureSheetOpen] = useState(false);
  const [captureDropdownOpen, setCaptureDropdownOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<AreaWithProject | null>(null);
  const [areaSearch, setAreaSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const annotateInputRef = useRef<HTMLInputElement>(null);
  
  const guestContext = useGuestOptional();
  const guest = guestContext?.guest;
  const isGuest = !!guest;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allAreas, isLoading: areasLoading } = useQuery<AreaWithProject[]>({
    queryKey: ["/api/areas/all"],
    enabled: captureSheetOpen && !isGuest,
  });

  const areaMatch = location.match(/\/(?:projects\/\d+\/)?areas\/(\d+)/);
  const currentAreaId = areaMatch ? parseInt(areaMatch[1]) : null;
  const projectMatch = location.match(/\/projects\/(\d+)/);
  const currentProjectId = projectMatch ? parseInt(projectMatch[1]) : null;
  const isInAreaRoute = currentAreaId !== null;

  const filteredAreas = allAreas?.filter(area => {
    if (!areaSearch) return true;
    const searchLower = areaSearch.toLowerCase();
    return (
      area.name.toLowerCase().includes(searchLower) ||
      area.projectName.toLowerCase().includes(searchLower) ||
      (area.clientName?.toLowerCase().includes(searchLower))
    );
  }) || [];

  useEffect(() => {
    if (isInAreaRoute && location.includes("?capture=true")) {
      setCaptureDropdownOpen(true);
      const cleanUrl = location.replace("?capture=true", "").replace("&capture=true", "");
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [location, isInAreaRoute]);

  const handleCaptureOpen = useCallback(() => {
    if (isInAreaRoute) {
      setCaptureDropdownOpen(true);
    } else {
      setCaptureSheetOpen(true);
    }
  }, [isInAreaRoute]);

  const handleAreaSelect = useCallback((area: AreaWithProject) => {
    setCaptureSheetOpen(false);
    setAreaSearch("");
    setLocation(`/projects/${area.projectId}/areas/${area.id}?capture=true`);
  }, [setLocation]);

  const uploadMutation = useMutation({
    mutationFn: async ({ areaId, files, openAnnotation, locationType }: { areaId: number; files: File[]; openAnnotation: boolean; locationType?: string }) => {
      setIsUploading(true);
      const uploadedPhotoIds: number[] = [];
      
      for (const file of files) {
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("interiorExterior", locationType || "Interior");
        
        const res = await fetch(`/api/areas/${areaId}/photos`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!res.ok) {
          throw new Error(`Upload failed: ${res.statusText}`);
        }
        
        const data = await res.json();
        if (data.id) {
          uploadedPhotoIds.push(data.id);
        }
      }
      
      return { uploadedPhotoIds, openAnnotation, areaId };
    },
    onSuccess: ({ uploadedPhotoIds, openAnnotation, areaId }) => {
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/areas", areaId, "photos"] });
      setCaptureDropdownOpen(false);
      
      if (openAnnotation && uploadedPhotoIds.length > 0) {
        setLocation(`/photos/${uploadedPhotoIds[0]}`);
      } else {
        toast({
          title: "Photos uploaded",
          description: `${uploadedPhotoIds.length} photo(s) added successfully`,
        });
      }
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleQuickAddClick = useCallback(() => {
    quickAddInputRef.current?.click();
  }, []);

  const handleAnnotateClick = useCallback(() => {
    annotateInputRef.current?.click();
  }, []);

  const handleQuickAddChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && currentAreaId) {
      uploadMutation.mutate({
        areaId: currentAreaId,
        files: Array.from(files),
        openAnnotation: false,
      });
    }
    e.target.value = "";
  }, [currentAreaId, uploadMutation]);

  const handleAnnotateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && currentAreaId) {
      uploadMutation.mutate({
        areaId: currentAreaId,
        files: Array.from(files),
        openAnnotation: true,
      });
    }
    e.target.value = "";
  }, [currentAreaId, uploadMutation]);

  const fullNavItems = [
    { icon: FolderKanban, label: "Projects", href: "/" },
    { icon: Archive, label: "Archive", href: "/archive" },
    { icon: FileText, label: "Exports", href: "/exports" },
    { icon: Link2, label: "Guest Links", href: "/guest-links" },
    { icon: Trash2, label: "Trash", href: "/trash" },
    { icon: Users, label: "Team", href: "/team" },
    { icon: CreditCard, label: "Billing", href: "/billing" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  const navItems = isGuest ? [] : fullNavItems;

  const mobileNavItems = [
    { icon: FolderKanban, label: "Projects", href: "/" },
    { icon: Camera, label: "Capture", action: "capture" },
    { icon: Link2, label: "Links", href: "/guest-links" },
    { icon: MoreHorizontal, label: "More", action: "more" },
  ];

  const moreMenuItems = [
    { icon: Archive, label: "Archive", href: "/archive" },
    { icon: FileText, label: "Exports", href: "/exports" },
    { icon: Trash2, label: "Trash", href: "/trash" },
    { icon: Users, label: "Team", href: "/team" },
    { icon: CreditCard, label: "Billing", href: "/billing" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <div className={cn(
      "min-h-screen bg-background flex flex-col md:flex-row",
      !isGuest && "pb-20 md:pb-0"
    )}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card/50 backdrop-blur-sm h-screen sticky top-0 z-50">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-lg">
              F
            </span>
            FieldScope
          </h1>
        </div>
        
        {isGuest && guest && (
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {guest.role === "contributor" ? (
                    <><Edit className="w-3 h-3 mr-1" /> Contributor</>
                  ) : (
                    <><Eye className="w-3 h-3 mr-1" /> Viewer</>
                  )}
                </Badge>
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground truncate">{guest.projectName}</p>
                <p className="text-muted-foreground text-xs truncate">{guest.clientName}</p>
              </div>
            </div>
          </div>
        )}
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium cursor-pointer",
                  location === item.href
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </div>
            </Link>
          ))}
        </nav>
        {!isGuest && (
          <div className="p-4 border-t border-border space-y-1">
            <Link href="/landing">
              <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">About</span>
            </Link>
            <div className="flex gap-2 flex-wrap">
              <Link href="/pricing">
                <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">Pricing</span>
              </Link>
              <Link href="/privacy">
                <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">Privacy</span>
              </Link>
              <Link href="/terms">
                <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">Terms</span>
              </Link>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border px-4 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl font-display font-bold text-foreground truncate">
            {isGuest && guest ? guest.projectName : (title || "FieldScope")}
          </h1>
          {isGuest && guest && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {guest.role === "contributor" ? "Contributor" : "Viewer"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action && <div>{action}</div>}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full animate-enter">
        {children}
      </main>

      {/* Mobile Bottom Nav - hidden for guests */}
      {!isGuest && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around z-50 pb-safe">
          {mobileNavItems.map((item) => {
            const isActive = item.href === location || 
              (item.action === "capture" && captureSheetOpen) ||
              (item.action === "more" && moreSheetOpen);
            
            if (item.action) {
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.action === "capture") handleCaptureOpen();
                    if (item.action === "more") setMoreSheetOpen(true);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors cursor-pointer",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid={`button-mobile-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            }
            
            return (
              <Link key={item.href} href={item.href!}>
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors cursor-pointer",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      )}

      {/* More Menu Sheet */}
      <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader>
            <SheetTitle className="text-left">More Options</SheetTitle>
          </SheetHeader>
          <nav className="grid grid-cols-3 gap-4 pt-4">
            {moreMenuItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <button
                  onClick={() => setMoreSheetOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl transition-colors w-full",
                    location === item.href
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`button-more-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Capture Sheet - Area Picker (only shown when not in an area) */}
      <Sheet open={captureSheetOpen} onOpenChange={(open) => {
        setCaptureSheetOpen(open);
        if (!open) {
          setSelectedArea(null);
          setAreaSearch("");
        }
      }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[80vh]">
          <SheetHeader>
            <SheetTitle className="text-left">Select Area</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-4 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search areas or projects..."
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                className="pl-9"
                data-testid="input-area-search"
              />
            </div>
            
            <div className="max-h-[40vh] overflow-y-auto space-y-2">
              {areasLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAreas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {areaSearch ? "No areas match your search" : "No areas found"}
                  </p>
                  <p className="text-xs mt-1">Create an area in a project first</p>
                </div>
              ) : (
                filteredAreas.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => handleAreaSelect(area)}
                    className="w-full p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left flex items-start gap-3"
                    data-testid={`button-select-area-${area.id}`}
                  >
                    <MapPin className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{area.name}</span>
                        {area.locationType && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {area.locationType}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {area.projectName}
                        {area.clientName && ` • ${area.clientName}`}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Capture Dropdown Menu (when in an area route) */}
      <DropdownMenu open={captureDropdownOpen} onOpenChange={setCaptureDropdownOpen}>
        <DropdownMenuTrigger className="hidden" />
        <DropdownMenuContent 
          align="center" 
          side="top" 
          className="w-56"
          style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)' }}
        >
          <DropdownMenuItem onClick={handleQuickAddClick} disabled={isUploading} data-testid="menu-quick-add-capture">
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Quick Add Photos
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAnnotateClick} disabled={isUploading} data-testid="menu-annotate-capture">
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
            Add & Annotate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file inputs for capture */}
      <input
        ref={quickAddInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleQuickAddChange}
        data-testid="input-capture-quick-add"
      />
      <input
        ref={annotateInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleAnnotateChange}
        data-testid="input-capture-annotate"
      />
    </div>
  );
}
