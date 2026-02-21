import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle, Clock, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type JobStatusType = "queued" | "pending" | "generating" | "running" | "ready" | "error";

interface JobStatusProps {
  status: JobStatusType;
  errorMessage?: string | null;
  progress?: number;
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
  className?: string;
  expandedByDefault?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

export function JobStatus({
  status,
  errorMessage,
  progress,
  onRetry,
  isRetrying,
  compact = false,
  className,
  expandedByDefault = false,
  onExpandChange,
}: JobStatusProps) {
  const [isExpanded, setIsExpanded] = useState(expandedByDefault);

  const handleExpandToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandChange?.(newExpanded);
  };

  const normalizedStatus = normalizeStatus(status);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={normalizedStatus} compact={compact} />
        
        {(normalizedStatus === "running" || normalizedStatus === "queued") && progress !== undefined && progress > 0 && (
          <span className="text-xs text-muted-foreground">
            {Math.round(progress)}%
          </span>
        )}

        {normalizedStatus === "error" && errorMessage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExpandToggle}
            className="h-6 px-2 text-xs"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse error details" : "Expand error details"}
            data-testid="button-toggle-error-details"
          >
            {isExpanded ? (
              <>
                Hide <ChevronUp className="w-3 h-3 ml-1" />
              </>
            ) : (
              <>
                Details <ChevronDown className="w-3 h-3 ml-1" />
              </>
            )}
          </Button>
        )}

        {normalizedStatus === "error" && onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="h-6 px-2 text-xs"
            aria-label="Retry export"
            data-testid="button-retry-export"
          >
            {isRetrying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry
              </>
            )}
          </Button>
        )}
      </div>

      {normalizedStatus === "error" && errorMessage && isExpanded && (
        <div
          className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive"
          role="alert"
          aria-live="polite"
          data-testid="error-details-panel"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function normalizeStatus(status: JobStatusType): "queued" | "running" | "ready" | "error" {
  switch (status) {
    case "queued":
    case "pending":
      return "queued";
    case "generating":
    case "running":
      return "running";
    case "ready":
      return "ready";
    case "error":
      return "error";
    default:
      return "queued";
  }
}

function StatusBadge({ status, compact }: { status: "queued" | "running" | "ready" | "error"; compact: boolean }) {
  switch (status) {
    case "queued":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {!compact && <span>Queued</span>}
          <span className="sr-only">Queued</span>
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          {!compact && <span>Processing</span>}
          <span className="sr-only">Processing</span>
        </Badge>
      );
    case "ready":
      return (
        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
          <Check className="w-3 h-3" aria-hidden="true" />
          {!compact && <span>Ready</span>}
          <span className="sr-only">Ready</span>
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          {!compact && <span>Failed</span>}
          <span className="sr-only">Failed</span>
        </Badge>
      );
  }
}

export function setErrorDetailsExpanded(exportId: number, expanded: boolean) {
  const event = new CustomEvent("expand-export-error", {
    detail: { exportId, expanded },
  });
  window.dispatchEvent(event);
}
