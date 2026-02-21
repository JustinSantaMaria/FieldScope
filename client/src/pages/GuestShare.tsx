import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle } from "lucide-react";

export default function GuestShare() {
  const [location, setLocation] = useLocation();

  const linkId = useMemo(() => {
    const match = location.match(/^\/share\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }, [location]);

  useEffect(() => {
    if (linkId) {
      setLocation(`/share/${linkId}/project`);
    }
  }, [linkId, setLocation]);

  if (!linkId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Invalid Link</h1>
          <p className="text-muted-foreground">
            The share link you followed is not valid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2
        className="h-8 w-8 animate-spin text-primary"
        data-testid="loading-redirect"
      />
    </div>
  );
}
