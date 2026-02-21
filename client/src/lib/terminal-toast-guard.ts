const STORAGE_PREFIX = "notified:export:";

const notifiedCache = new Map<number, "ready" | "error">();

export function hasBeenNotified(exportId: number, status: "ready" | "error"): boolean {
  const cached = notifiedCache.get(exportId);
  if (cached === status) return true;

  const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${exportId}`);
  if (stored === status) {
    notifiedCache.set(exportId, status);
    return true;
  }

  return false;
}

export function markAsNotified(exportId: number, status: "ready" | "error"): void {
  notifiedCache.set(exportId, status);
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${exportId}`, status);
  } catch (e) {
  }
}

export function clearNotification(exportId: number): void {
  notifiedCache.delete(exportId);
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${exportId}`);
  } catch (e) {
  }
}

export function shouldShowTerminalToast(
  exportId: number,
  currentStatus: string,
  previousStatus: string | undefined
): { shouldShow: boolean; toastType: "ready" | "error" | null } {
  const isTerminalStatus = currentStatus === "ready" || currentStatus === "error";
  if (!isTerminalStatus) {
    return { shouldShow: false, toastType: null };
  }

  const toastType = currentStatus as "ready" | "error";

  if (hasBeenNotified(exportId, toastType)) {
    return { shouldShow: false, toastType };
  }

  const wasRunning = previousStatus === "generating" || previousStatus === "running" || 
                     previousStatus === "queued" || previousStatus === "pending";

  if (wasRunning || previousStatus === undefined) {
    return { shouldShow: true, toastType };
  }

  return { shouldShow: false, toastType };
}

export function initializeFromExports(exports: Array<{ id: number; status: string | null }>): void {
  for (const exp of exports) {
    if (exp.status === "ready" || exp.status === "error") {
      const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${exp.id}`);
      if (stored === exp.status) {
        notifiedCache.set(exp.id, exp.status);
      }
    }
  }
}
