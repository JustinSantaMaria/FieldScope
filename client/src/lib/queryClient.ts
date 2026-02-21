import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getGlobalGuestLinkId } from "./guest-context";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // If we get 401/403/410 while using a guest link, the link is invalid/revoked
    const guestLinkId = getGlobalGuestLinkId();
    if (guestLinkId && (res.status === 401 || res.status === 403 || res.status === 410)) {
      window.dispatchEvent(new CustomEvent("guest-link-revoked", { detail: { linkId: guestLinkId } }));
    }
    
    throw new Error(`${res.status}: ${text}`);
  }
}

function getGuestHeaders(): Record<string, string> {
  const guestLinkId = getGlobalGuestLinkId();
  if (guestLinkId) {
    return { "X-Guest-Link": guestLinkId };
  }
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const guestHeaders = getGuestHeaders();
  const headers: Record<string, string> = {
    ...guestHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function guestFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const guestHeaders = getGuestHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...guestHeaders,
      ...(options.headers || {}),
    },
    credentials: "include",
  });
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const guestHeaders = getGuestHeaders();
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: guestHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
