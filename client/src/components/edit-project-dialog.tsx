import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useUpdateProject } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import { insertProjectSchema, type Project } from "@shared/schema";

const formSchema = insertProjectSchema.pick({
  clientName: true,
  siteName: true,
  address: true,
  surveyId: true,
});

type FormValues = z.infer<typeof formSchema>;

interface EditProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProjectDialog({ project, open, onOpenChange }: EditProjectDialogProps) {
  const { toast } = useToast();
  const { mutate: updateProject, isPending } = useUpdateProject();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: project.clientName,
      siteName: project.siteName,
      address: project.address || "",
      surveyId: project.surveyId,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        clientName: project.clientName,
        siteName: project.siteName,
        address: project.address || "",
        surveyId: project.surveyId,
      });
    }
  }, [open, project, form]);

  const onSubmit = (data: FormValues) => {
    updateProject(
      { id: project.id, data },
      {
        onSuccess: () => {
          toast({ title: "Project updated" });
          onOpenChange(false);
        },
        onError: (error) => {
          toast({
            title: "Update failed",
            description: error.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
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
                    <Input placeholder="Acme Corp" {...field} data-testid="input-client-name" />
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
                    <Input placeholder="Main Office" {...field} data-testid="input-site-name" />
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
                    <Input placeholder="123 Main St, City, ST 12345" {...field} value={field.value || ""} data-testid="input-address" />
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
                    <Input placeholder="SRV-2024-001" {...field} data-testid="input-survey-id" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isPending} data-testid="button-save-project">
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
