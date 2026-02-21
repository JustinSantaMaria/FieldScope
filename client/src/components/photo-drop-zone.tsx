import { useCallback, useState } from "react";
import { Upload, X, AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateImageFile, MAX_BATCH_SIZE } from "@/lib/imageCompression";
import { Progress } from "@/components/ui/progress";

export interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

interface PhotoDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  fileStatuses?: FileUploadStatus[];
  isUploading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function PhotoDropZone({
  onFilesSelected,
  fileStatuses = [],
  isUploading = false,
  disabled = false,
  className = "",
}: PhotoDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    const imageFiles = droppedFiles.filter(file => 
      file.type.startsWith('image/') || 
      file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|heic|heif)$/)
    );

    if (imageFiles.length === 0) {
      return;
    }

    if (imageFiles.length > MAX_BATCH_SIZE) {
      const limitedFiles = imageFiles.slice(0, MAX_BATCH_SIZE);
      onFilesSelected(limitedFiles);
      return;
    }

    onFilesSelected(imageFiles);
  }, [disabled, onFilesSelected]);

  const hasActiveUploads = fileStatuses.some(s => s.status === 'uploading');
  const hasErrors = fileStatuses.some(s => s.status === 'error');

  return (
    <div className={cn("space-y-4", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-md p-8 text-center transition-colors",
          isDragging && "border-primary bg-primary/5",
          !isDragging && "border-muted-foreground/25",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        data-testid="photo-drop-zone"
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag and drop photos here
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max {MAX_BATCH_SIZE} files, 15MB each
        </p>
      </div>

      {fileStatuses.length > 0 && (
        <div className="space-y-2" data-testid="upload-status-list">
          {fileStatuses.map((status, index) => (
            <div 
              key={`${status.file.name}-${index}`}
              className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
              data-testid={`upload-status-${index}`}
            >
              {status.status === 'uploading' && (
                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
              )}
              {status.status === 'success' && (
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              )}
              {status.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
              {status.status === 'pending' && (
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
              )}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{status.file.name}</p>
                {status.status === 'uploading' && (
                  <Progress value={status.progress} className="h-1 mt-1" />
                )}
                {status.error && (
                  <p className="text-xs text-destructive mt-0.5">{status.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
