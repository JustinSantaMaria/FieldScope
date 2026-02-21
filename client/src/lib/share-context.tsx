import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getShareHeaders } from "./share-fetch";

export interface ShareContextValue {
  isShareMode: boolean;
  linkId: string;
  projectId: number;
  role: "contributor" | "viewer";
  isContributor: boolean;
  shareHeaders: Record<string, string>;
  project: {
    id: number;
    clientName: string;
    siteName: string;
    address: string | null;
  } | null;
}

const ShareContext = createContext<ShareContextValue | null>(null);

interface ShareBootstrap {
  linkId: string;
  projectId: number;
  orgId: number;
  role: "contributor" | "viewer";
  project: {
    id: number;
    clientName: string;
    siteName: string;
    address: string | null;
  };
}

interface ShareProviderProps {
  linkId: string;
  children: React.ReactNode;
}

export function ShareProvider({ linkId, children }: ShareProviderProps) {
  const shareHeaders = useMemo(() => getShareHeaders(linkId), [linkId]);

  const { data: bootstrap, isLoading, error } = useQuery<ShareBootstrap>({
    queryKey: ["/api/share", linkId, "bootstrap"],
    queryFn: async () => {
      const res = await fetch(`/api/share/${linkId}/bootstrap`, { headers: shareHeaders });
      if (!res.ok) {
        const data = await res.json();
        throw data;
      }
      return res.json();
    },
    retry: false,
    enabled: !!linkId,
    staleTime: 5 * 60 * 1000,
  });

  const contextValue = useMemo<ShareContextValue | null>(() => {
    if (!bootstrap) return null;
    return {
      isShareMode: true,
      linkId,
      projectId: bootstrap.projectId,
      role: bootstrap.role,
      isContributor: bootstrap.role === "contributor",
      shareHeaders,
      project: bootstrap.project,
    };
  }, [bootstrap, linkId, shareHeaders]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Loading shared project...</p>
        </div>
      </div>
    );
  }

  if (error || !bootstrap) {
    const err = error as any;
    const code = err?.code || "UNKNOWN";
    let title = "Unable to access project";
    let description = err?.message || "Something went wrong";

    if (code === "NOT_FOUND" || code === "REVOKED") {
      title = "This link is no longer active";
      description = code === "REVOKED"
        ? "The project owner revoked access to this shared link."
        : "The share link does not exist or has been removed.";
    } else if (code === "EXPIRED") {
      title = "This link has expired";
      description = "Please contact the project owner for a new link.";
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-12 w-12 mx-auto text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <ShareContext.Provider value={contextValue}>
      {children}
    </ShareContext.Provider>
  );
}

export function useShareContext(): ShareContextValue | null {
  return useContext(ShareContext);
}

export function useShareContextRequired(): ShareContextValue {
  const context = useContext(ShareContext);
  if (!context) {
    throw new Error("useShareContextRequired must be used within a ShareProvider");
  }
  return context;
}

export function useIsShareMode(): boolean {
  const context = useContext(ShareContext);
  return context?.isShareMode ?? false;
}
