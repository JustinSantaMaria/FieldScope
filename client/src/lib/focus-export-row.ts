import { showNotification, dismissNotification } from "@/hooks/use-notification-manager";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 200;
const HIGHLIGHT_DURATION_MS = 2000;

type FocusExportRowOptions = {
  expandError?: boolean;
  enableShowAll?: () => void;
};

export async function focusExportRow(
  exportId: number,
  options: FocusExportRowOptions = {}
): Promise<boolean> {
  const { expandError = true, enableShowAll } = options;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const row = document.querySelector(`[data-export-id="${exportId}"]`) as HTMLElement | null;

    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });

      if (expandError) {
        const event = new CustomEvent("expand-export-error", {
          detail: { exportId, expanded: true },
        });
        window.dispatchEvent(event);
      }

      row.classList.add("export-row-highlight");
      setTimeout(() => {
        row.classList.remove("export-row-highlight");
      }, HIGHLIGHT_DURATION_MS);

      const focusTarget = row.querySelector("[data-testid='error-details-panel']") as HTMLElement | null;
      if (focusTarget) {
        focusTarget.setAttribute("tabindex", "-1");
        focusTarget.focus();
      } else {
        row.setAttribute("tabindex", "-1");
        row.focus();
      }

      announceToScreenReader("Export details expanded.");

      return true;
    }

    if (attempt === 0 && enableShowAll) {
      enableShowAll();
    }

    await sleep(RETRY_DELAY_MS);
  }

  showNotification({
    id: `focus-error:${exportId}`,
    title: "Couldn't locate export row",
    description: "The export row may have been removed or is still loading.",
    type: "error",
    actions: [
      { label: "Dismiss", onClick: () => dismissNotification(`focus-error:${exportId}`) },
    ],
  });

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function announceToScreenReader(message: string) {
  const announcer = document.getElementById("aria-live-announcer");
  if (announcer) {
    announcer.textContent = message;
    setTimeout(() => {
      announcer.textContent = "";
    }, 1000);
  } else {
    const newAnnouncer = document.createElement("div");
    newAnnouncer.id = "aria-live-announcer";
    newAnnouncer.setAttribute("aria-live", "polite");
    newAnnouncer.setAttribute("aria-atomic", "true");
    newAnnouncer.className = "sr-only";
    document.body.appendChild(newAnnouncer);
    newAnnouncer.textContent = message;
    setTimeout(() => {
      newAnnouncer.textContent = "";
    }, 1000);
  }
}

export function scrollToFirstActiveExport(): boolean {
  const activeRow = document.querySelector(
    '[data-export-status="queued"], [data-export-status="generating"], [data-export-status="running"], [data-export-status="pending"]'
  ) as HTMLElement | null;

  if (activeRow) {
    activeRow.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  const header = document.querySelector('[data-testid="export-history-header"]') as HTMLElement | null;
  if (header) {
    header.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return false;
}
