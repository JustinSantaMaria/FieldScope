import { Link } from "wouter";
import { ArrowLeft, Eye, Edit3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ShareLayoutProps {
  children: React.ReactNode;
  linkId: string;
  projectName?: string;
  role: "contributor" | "viewer";
  backPath?: string;
  backLabel?: string;
  action?: React.ReactNode;
}

export function ShareLayout({ 
  children, 
  linkId, 
  projectName, 
  role, 
  backPath,
  backLabel,
  action
}: ShareLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-2 px-4 h-14">
          <div className="flex items-center gap-2">
            {backPath && (
              <Link href={backPath}>
                <Button variant="ghost" size="icon" data-testid="button-share-back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate max-w-[200px]" data-testid="text-share-project-name">
                {projectName || "Shared Project"}
              </span>
              <Badge 
                variant={role === "contributor" ? "default" : "secondary"} 
                className="text-xs"
                data-testid="badge-share-role"
              >
                {role === "contributor" ? (
                  <>
                    <Edit3 className="h-3 w-3 mr-1" />
                    Contributor
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 mr-1" />
                    View Only
                  </>
                )}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {action}
            <span className="text-xs text-muted-foreground hidden sm:block">
              Shared Access
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
