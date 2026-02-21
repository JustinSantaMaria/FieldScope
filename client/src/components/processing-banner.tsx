import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { scrollToFirstActiveExport } from "@/lib/focus-export-row";

interface ProcessingBannerProps {
  count: number;
  className?: string;
}

export function ProcessingBanner({ count, className }: ProcessingBannerProps) {
  const [location, setLocation] = useLocation();

  if (count === 0) return null;

  const handleClick = () => {
    if (location !== "/exports") {
      setLocation("/exports");
      setTimeout(() => {
        scrollToFirstActiveExport();
      }, 300);
    } else {
      scrollToFirstActiveExport();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 
        bg-muted/80 hover:bg-muted 
        border border-border rounded-md 
        text-sm text-muted-foreground 
        transition-colors cursor-pointer
        ${className || ""}
      `}
      aria-label={`Processing ${count} export${count > 1 ? "s" : ""}. Click to view.`}
      data-testid="processing-banner"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      <span>Processing {count} export{count > 1 ? "s" : ""}...</span>
      <Badge variant="secondary" className="ml-1 text-xs">
        {count}
      </Badge>
    </button>
  );
}
