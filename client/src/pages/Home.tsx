import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useActiveProjects, useCreateProject, useArchiveProject, useDeleteProject, useRestoreDeletedProject } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Loader2, FolderKanban } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

const formSchema = insertProjectSchema.pick({
  clientName: true,
  siteName: true,
  surveyId: true,
  address: true,
});

type FormValues = z.infer<typeof formSchema>;

export default function Home() {
  const { data: projects, isLoading } = useActiveProjects();
  const { mutate: createProject, isPending: isCreating } = useCreateProject();
  const { mutate: archiveProject } = useArchiveProject();
  const { mutate: deleteProject } = useDeleteProject();
  const { mutate: restoreDeletedProject } = useRestoreDeletedProject();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: number; name: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: "",
      siteName: "",
      surveyId: "",
      address: "",
    },
  });

  const onSubmit = (data: FormValues) => {
    createProject(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  };

  const handleArchive = (id: number) => {
    const project = projects?.find(p => p.id === id);
    archiveProject(id, {
      onSuccess: () => {
        toast({
          title: "Project archived",
          description: `"${project?.siteName}" has been moved to the archive.`,
        });
      },
      onError: (err) => {
        toast({
          title: "Failed to archive",
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
        
        toast({
          title: "Project deleted",
          description: `"${name}" has been deleted.`,
          duration: 10000,
          action: (
            <ToastAction
              altText="Undo"
              onClick={() => {
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
      p.surveyId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <LayoutShell
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full h-10 w-10 md:hidden bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg">
              <Plus className="h-6 w-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="siteName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Downtown Branch" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="surveyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Survey ID or Project ID</FormLabel>
                      <FormControl>
                        <Input placeholder="SRV-2024-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main St, City, State" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isCreating}>
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Project
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Projects</h2>
          <p className="text-muted-foreground mt-1">Manage your active field surveys</p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects..." 
              className="pl-9 bg-background/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="hidden md:block">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-sm">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="clientName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Corp" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="siteName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Downtown Branch" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="surveyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Survey ID or Project ID</FormLabel>
                          <FormControl>
                            <Input placeholder="SRV-2024-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main St, City, State" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={isCreating}>
                      {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create Project
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-muted/20 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : filteredProjects?.length === 0 ? (
        <div className="text-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border">
          <FolderKanban className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground">No projects found</h3>
          <p className="text-muted-foreground mt-2">Create your first project to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects?.map((project) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              onArchive={handleArchive}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Project"
        description={`This will permanently delete "${projectToDelete?.name}" and all its areas, photos, and annotations. This action cannot be undone.`}
        confirmText={projectToDelete?.name || ""}
        placeholder="Type project name to confirm"
        onConfirm={handleDeleteConfirm}
      />
    </LayoutShell>
  );
}
