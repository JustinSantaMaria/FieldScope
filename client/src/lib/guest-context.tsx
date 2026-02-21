import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface GuestSession {
  isGuest: true;
  linkId: string;
  projectId: number;
  orgId: number;
  role: "contributor" | "viewer";
  projectName: string;
  clientName: string;
}

interface ShareSessionStatus {
  isShareSession: boolean;
  linkId?: string;
  projectId?: number;
  role?: "contributor" | "viewer";
}

interface GuestContextValue {
  guest: GuestSession | null;
  setGuest: (session: GuestSession | null) => void;
  clearGuest: () => void;
  isGuestContributor: boolean;
  isShareSession: boolean;
  shareSessionChecked: boolean;
}

const GuestContext = createContext<GuestContextValue | null>(null);

const GUEST_STORAGE_KEY = "fieldscope_guest_session";

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  const [guest, setGuestState] = useState<GuestSession | null>(() => {
    try {
      const stored = sessionStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return null;
  });

  const { data: shareStatus, isSuccess, isError } = useQuery<ShareSessionStatus>({
    queryKey: ["/api/share-session/status"],
    queryFn: async () => {
      const res = await fetch("/api/share-session/status", { credentials: "include" });
      if (!res.ok) {
        // Return a default "not in share session" state on error
        return { isShareSession: false };
      }
      return res.json();
    },
    retry: false,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // Mark as checked when query completes (success or error)
  const shareSessionChecked = isSuccess || isError;
  const isShareSession = shareStatus?.isShareSession ?? false;

  const setGuest = useCallback((session: GuestSession | null) => {
    setGuestState(session);
    if (session) {
      sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(GUEST_STORAGE_KEY);
    }
  }, []);

  const clearGuest = useCallback(async () => {
    setGuestState(null);
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
    setGlobalGuestLinkId(null);
    
    try {
      await fetch("/api/share-session/clear", { method: "POST", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: ["/api/share-session/status"] });
    } catch {}
  }, [queryClient]);

  // Listen for guest link revocation events
  useEffect(() => {
    const handleRevoked = (event: CustomEvent<{ linkId: string }>) => {
      if (guest && guest.linkId === event.detail.linkId) {
        clearGuest();
        // Redirect to the share link page which will show the "link not active" message
        window.location.href = `/share/${event.detail.linkId}`;
      }
    };

    window.addEventListener("guest-link-revoked", handleRevoked as EventListener);
    return () => {
      window.removeEventListener("guest-link-revoked", handleRevoked as EventListener);
    };
  }, [guest, clearGuest]);

  const isGuestContributor = guest?.role === "contributor";

  return (
    <GuestContext.Provider value={{ 
      guest, 
      setGuest, 
      clearGuest, 
      isGuestContributor,
      isShareSession,
      shareSessionChecked,
    }}>
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest() {
  const context = useContext(GuestContext);
  if (!context) {
    throw new Error("useGuest must be used within a GuestProvider");
  }
  return context;
}

export function useGuestOptional() {
  return useContext(GuestContext);
}

let globalGuestLinkId: string | null = null;

export function setGlobalGuestLinkId(linkId: string | null) {
  globalGuestLinkId = linkId;
}

export function getGlobalGuestLinkId() {
  return globalGuestLinkId;
}
