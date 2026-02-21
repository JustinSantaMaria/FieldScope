import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Camera, Loader2, ChevronDown, Zap, Pencil } from "lucide-react";

export interface PhotoSelectionResult {
  files: File[];
  source: "camera" | "library";
}

interface PhotoUploadButtonProps {
  onFilesSelected: (files: File[], source?: "camera" | "library") => void;
  onQuickAdd?: (files: File[], source?: "camera" | "library") => void;
  isUploading?: boolean;
  disabled?: boolean;
  variant?: "default" | "mobile";
  className?: string;
}

export function PhotoUploadButton({
  onFilesSelected,
  onQuickAdd,
  isUploading = false,
  disabled = false,
  variant = "default",
  className = "",
}: PhotoUploadButtonProps) {
  const annotateInputRef = useRef<HTMLInputElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  const handleAnnotateClick = useCallback(() => {
    annotateInputRef.current?.click();
  }, []);

  const handleQuickAddClick = useCallback(() => {
    quickAddInputRef.current?.click();
  }, []);

  const handleAnnotateInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files), "library");
    }
    e.target.value = "";
  }, [onFilesSelected]);

  const handleQuickAddInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onQuickAdd) {
      onQuickAdd(Array.from(files), "library");
    }
    e.target.value = "";
  }, [onQuickAdd]);

  if (variant === "mobile") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className={`rounded-full bg-accent text-accent-foreground ${className}`}
              disabled={disabled || isUploading}
              data-testid="button-upload-photo-mobile"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Camera className="w-6 h-6" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onQuickAdd && (
              <DropdownMenuItem 
                onClick={handleQuickAddClick}
                data-testid="menu-quick-add"
              >
                <Zap className="w-4 h-4 mr-2" />
                Quick Add Photos
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              onClick={handleAnnotateClick}
              data-testid="menu-add-annotate"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Add & Annotate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <input
          ref={annotateInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleAnnotateInputChange}
          data-testid="input-annotate-select"
        />
        {onQuickAdd && (
          <input
            ref={quickAddInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleQuickAddInputChange}
            data-testid="input-quick-add-select"
          />
        )}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            className={className}
            disabled={disabled || isUploading}
            data-testid="button-upload-photo"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Camera className="w-4 h-4 mr-2" />
            )}
            Add Photo
            <ChevronDown className="w-4 h-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {onQuickAdd && (
            <DropdownMenuItem 
              onClick={handleQuickAddClick}
              data-testid="menu-quick-add"
            >
              <Zap className="w-4 h-4 mr-2" />
              Quick Add Photos
            </DropdownMenuItem>
          )}
          <DropdownMenuItem 
            onClick={handleAnnotateClick}
            data-testid="menu-add-annotate"
          >
            <Pencil className="w-4 h-4 mr-2" />
            Add & Annotate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <input
        ref={annotateInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleAnnotateInputChange}
        data-testid="input-annotate-select"
      />
      {onQuickAdd && (
        <input
          ref={quickAddInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleQuickAddInputChange}
          data-testid="input-quick-add-select"
        />
      )}
    </>
  );
}
