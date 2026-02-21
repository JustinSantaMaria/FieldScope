import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Loader2 } from "lucide-react";
import { useUpdateArea } from "@/hooks/use-areas";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertAreaSchema, type Area } from "@shared/schema";

const formSchema = insertAreaSchema.pick({
  name: true,
  notes: true,
  locationType: true,
}).extend({
  locationType: z.enum(["Interior", "Exterior", "Vehicle"]),
});

type FormValues = z.infer<typeof formSchema>;

interface EditAreaDialogProps {
  area: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAreaDialog({ area, open, onOpenChange }: EditAreaDialogProps) {
  const { toast } = useToast();
  const { mutate: updateArea, isPending } = useUpdateArea();
  const [showLocationChangeConfirm, setShowLocationChangeConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);
  const [isUpdatingPhotos, setIsUpdatingPhotos] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: area.name,
      notes: area.notes || "",
      locationType: (area.locationType as "Interior" | "Exterior" | "Vehicle") || "Interior",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: area.name,
        notes: area.notes || "",
        locationType: (area.locationType as "Interior" | "Exterior" | "Vehicle") || "Interior",
      });
    }
  }, [open, area, form]);

  const performUpdate = async (data: FormValues, applyToPhotos: boolean) => {
    setIsUpdatingPhotos(applyToPhotos);
    
    // First update the area
    updateArea(
      { id: area.id, data },
      {
        onSuccess: async () => {
          // If location type changed and user wants to apply to photos
          if (applyToPhotos && data.locationType !== area.locationType) {
            try {
              await apiRequest("PATCH", `/api/areas/${area.id}/photos/location-type`, {
                locationType: data.locationType,
              });
              queryClient.invalidateQueries({ queryKey: ["/api/areas", area.id, "photos"] });
              toast({ title: "Area and photos updated" });
            } catch (error) {
              toast({
                title: "Area updated, but photo update failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive",
              });
            }
          } else {
            toast({ title: "Area updated" });
          }
          setIsUpdatingPhotos(false);
          onOpenChange(false);
        },
        onError: (error) => {
          setIsUpdatingPhotos(false);
          toast({
            title: "Update failed",
            description: error.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const onSubmit = (data: FormValues) => {
    // Check if location type is changing
    if (data.locationType !== area.locationType) {
      setPendingSubmitData(data);
      setShowLocationChangeConfirm(true);
    } else {
      performUpdate(data, false);
    }
  };

  const handleLocationChangeConfirm = (applyToPhotos: boolean) => {
    setShowLocationChangeConfirm(false);
    if (pendingSubmitData) {
      performUpdate(pendingSubmitData, applyToPhotos);
      setPendingSubmitData(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Area</DialogTitle>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-location-type">
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
                      <Input placeholder="Keycode: 1234" {...field} value={field.value || ""} data-testid="input-area-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isPending || isUpdatingPhotos} data-testid="button-save-area">
                {(isPending || isUpdatingPhotos) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showLocationChangeConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowLocationChangeConfirm(false);
            setPendingSubmitData(null);
          }
        }}
        title="Apply to existing photos?"
        description={`You changed the location type to "${pendingSubmitData?.locationType}". Would you like to update all existing photos in this area to match?`}
        confirmLabel="Yes, update photos"
        cancelLabel="No, only new photos"
        onConfirm={() => handleLocationChangeConfirm(true)}
        onCancel={() => handleLocationChangeConfirm(false)}
      />
    </>
  );
}
