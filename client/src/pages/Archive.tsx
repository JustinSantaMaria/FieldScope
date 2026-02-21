import { useState, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useArchivedProjects, useArchivedYears, useRestoreProject, useDeleteProject, useRestoreDeletedProject } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Archive as ArchiveIcon, FolderOpen, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { cn } from "@/lib/utils";

export default function Archive() {
  const { data: years, isLoading: yearsLoading } = useArchivedYears();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  
  const activeYear = selectedYear ?? (years && years.length > 0 ? years[0] : currentYear);
  
  const { data: projects, isLoading: projectsLoading } = useArchivedProjects(activeYear);
  const { mutate: restoreProject } = useRestoreProject();
  const { mutate: deleteProject } = useDeleteProject();
  const { mutate: restoreDeletedProject } = useRestoreDeletedProject();
  const { toast, dismiss } = useToast();
  const [search, setSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: number; name: string } | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleRestore = (id: number) => {
    const project = projects?.find(p => p.id === id);
    restoreProject(id, {
      onSuccess: () => {
        toast({
          title: "Project restored",
          description: `"${project?.siteName}" has been restored to active projects.`,
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

  const handleDeleteClick = (id: number) => {
    const project = projects?.find(p => p.id === id);
    if (project) {
      setProjectToDelete({ id, name: project.siteName });
      setDeleteDialogOpen(true);
    }
  };

  const handleDeleteConfirm = () => {
    if (!projectToDelete) return;
    const { id, name } = projectToDelete;
    
    deleteProject(id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setProjectToDelete(null);
        
        const { id: toastId } = toast({
          title: "Project deleted",
          description: `"${name}" has been deleted.`,
          duration: 10000,
          action: (
            <ToastAction
              altText="Undo"
              onClick={() => {
                if (undoTimeoutRef.current) {
                  clearTimeout(undoTimeoutRef.current);
                }
                restoreDeletedProject(id, {
                  onSuccess: () => {
                    toast({
                      title: "Restored",
                      description: `"${name}" has been restored.`,
                    });
                  },
                  onError: () => {
                    toast({
                      title: "Failed to restore",
                      description: "Could not undo deletion.",
                      variant: "destructive",
                    });
                  },
                });
              }}
            >
              Undo
            </ToastAction>
          ),
        });
      },
      onError: (err) => {
        toast({
          title: "Failed to delete",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  const filteredProjects = projects?.filter(
    (p) =>
      p.clientName.toLowerCase().includes(search.toLowerCase()) ||
      p.siteName.toLowerCase().includes(search.toLowerCase()) ||
      (p.surveyId && p.surveyId.toLowerCase().includes(search.toLowerCase()))
  );

  const isLoading = yearsLoading || projectsLoading;

  return (
    <LayoutShell title="Archive">
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-56 shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-lg">Years</h2>
          </div>
          
          {yearsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : years && years.length > 0 ? (
            <div className="flex flex-row lg:flex-col gap-2 flex-wrap">
              {years.map((year) => (
                <Button
                  key={year}
                  variant={activeYear === year ? "secondary" : "ghost"}
                  className={cn(
                    "justify-start gap-2",
                    activeYear === year && "bg-accent"
                  )}
                  onClick={() => setSelectedYear(year)}
                  data-testid={`button-year-${year}`}
                >
                  <FolderOpen className="w-4 h-4" />
                  {year}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              No archived projects yet.
            </p>
          )}
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 mb-6">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-3">
              <ArchiveIcon className="w-7 h-7 text-muted-foreground" />
              Archive
              {activeYear && (
                <Badge variant="secondary" className="text-base font-normal">
                  {activeYear}
                </Badge>
              )}
            </h1>
          </div>

          <div className="relative max-w-md mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search archived projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-archive"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredProjects && filteredProjects.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRestore={handleRestore}
                  onDelete={handleDeleteClick}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ArchiveIcon className="w-16 h-16 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                {search ? "No matches found" : "No archived projects"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {search
                  ? `No archived projects match "${search}".`
                  : `There are no archived projects for ${activeYear}.`}
              </p>
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Project Permanently"
        description={`This will permanently delete "${projectToDelete?.name}" and all its areas, photos, and annotations. This action cannot be undone.`}
        confirmText={projectToDelete?.name || ""}
        placeholder="Type the project name to confirm"
        onConfirm={handleDeleteConfirm}
      />
    </LayoutShell>
  );
}
