import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  placeholder?: string;
  onConfirm: () => void;
  caseSensitive?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  placeholder = "Type to confirm",
  onConfirm,
  caseSensitive = false,
}: DeleteConfirmDialogProps) {
  const [inputValue, setInputValue] = useState("");
  
  const isConfirmEnabled = caseSensitive 
    ? inputValue === confirmText 
    : inputValue.toLowerCase() === confirmText.toLowerCase();

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setInputValue("");
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = () => {
    if (isConfirmEnabled) {
      onConfirm();
      setInputValue("");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <span>{description}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="py-2">
          <Label htmlFor="confirm-input" className="text-sm text-muted-foreground">
            {placeholder}
          </Label>
          <Input
            id="confirm-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmText}
            className="mt-2"
            data-testid="input-delete-confirm"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
