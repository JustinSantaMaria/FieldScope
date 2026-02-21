import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

export type NotificationType = "success" | "info" | "warning" | "error";

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  duration?: number | null;
  actions?: NotificationAction[];
  isPaused?: boolean;
  createdAt: number;
}

interface NotificationState {
  notifications: Notification[];
}

const MAX_VISIBLE = 3;

const DURATIONS: Record<NotificationType, number | null> = {
  success: 3000,
  info: 3000,
  warning: 6000,
  error: null,
};

type ActionType =
  | { type: "SHOW"; notification: Notification }
  | { type: "UPDATE"; id: string; partial: Partial<Omit<Notification, "id">> }
  | { type: "DISMISS"; id: string }
  | { type: "PAUSE"; id: string }
  | { type: "RESUME"; id: string }
  | { type: "REMOVE"; id: string };

const notificationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const pausedTimeRemaining = new Map<string, number>();

function clearNotificationTimeout(id: string) {
  const timeout = notificationTimeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    notificationTimeouts.delete(id);
  }
}

function reducer(state: NotificationState, action: ActionType): NotificationState {
  switch (action.type) {
    case "SHOW": {
      const existing = state.notifications.find((n) => n.id === action.notification.id);
      if (existing) {
        return {
          ...state,
          notifications: state.notifications.map((n) =>
            n.id === action.notification.id ? { ...n, ...action.notification } : n
          ),
        };
      }
      let newNotifications = [action.notification, ...state.notifications];
      if (newNotifications.length > MAX_VISIBLE) {
        const nonErrorsToRemove = newNotifications
          .filter((n) => n.type !== "error")
          .slice(MAX_VISIBLE - 1);
        if (nonErrorsToRemove.length > 0) {
          const idsToRemove = new Set(nonErrorsToRemove.map((n) => n.id));
          newNotifications = newNotifications.filter((n) => !idsToRemove.has(n.id));
        }
        newNotifications = newNotifications.slice(0, MAX_VISIBLE);
      }
      return { ...state, notifications: newNotifications };
    }
    case "UPDATE": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, ...action.partial } : n
        ),
      };
    }
    case "DISMISS":
    case "REMOVE": {
      clearNotificationTimeout(action.id);
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    }
    case "PAUSE": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, isPaused: true } : n
        ),
      };
    }
    case "RESUME": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, isPaused: false } : n
        ),
      };
    }
    default:
      return state;
  }
}

const listeners: Array<(state: NotificationState) => void> = [];
let memoryState: NotificationState = { notifications: [] };

function dispatch(action: ActionType) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

function scheduleAutoDismiss(id: string, duration: number) {
  clearNotificationTimeout(id);
  const timeout = setTimeout(() => {
    dispatch({ type: "DISMISS", id });
    notificationTimeouts.delete(id);
    pausedTimeRemaining.delete(id);
  }, duration);
  notificationTimeouts.set(id, timeout);
  pausedTimeRemaining.set(id, duration);
}

export interface ShowNotificationOptions {
  id: string;
  title: string;
  description?: string;
  type?: NotificationType;
  duration?: number | null;
  actions?: NotificationAction[];
}

export function showNotification(options: ShowNotificationOptions) {
  const type = options.type || "info";
  const duration = options.duration !== undefined ? options.duration : DURATIONS[type];

  const notification: Notification = {
    id: options.id,
    title: options.title,
    description: options.description,
    type,
    duration,
    actions: options.actions,
    isPaused: false,
    createdAt: Date.now(),
  };

  if (process.env.NODE_ENV === "development") {
    console.log(`[NotificationManager] show: ${options.id}`, { type, duration });
  }

  dispatch({ type: "SHOW", notification });

  if (duration && duration > 0) {
    scheduleAutoDismiss(options.id, duration);
  }

  return options.id;
}

export function updateNotification(
  id: string,
  partial: Partial<Omit<ShowNotificationOptions, "id">>
) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[NotificationManager] update: ${id}`, partial);
  }

  const type = partial.type;
  const duration = partial.duration !== undefined 
    ? partial.duration 
    : type 
      ? DURATIONS[type] 
      : undefined;

  dispatch({ type: "UPDATE", id, partial: { ...partial, duration } as Partial<Notification> });

  if (duration && duration > 0) {
    scheduleAutoDismiss(id, duration);
  } else if (duration === null) {
    clearNotificationTimeout(id);
  }
}

export function dismissNotification(id: string) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[NotificationManager] dismiss: ${id}`);
  }
  dispatch({ type: "DISMISS", id });
}

export function pauseNotification(id: string) {
  const notification = memoryState.notifications.find((n) => n.id === id);
  if (!notification || notification.isPaused) return;

  const timeout = notificationTimeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    notificationTimeouts.delete(id);
  }

  dispatch({ type: "PAUSE", id });
}

export function resumeNotification(id: string) {
  const notification = memoryState.notifications.find((n) => n.id === id);
  if (!notification || !notification.isPaused) return;

  dispatch({ type: "RESUME", id });

  const remaining = pausedTimeRemaining.get(id);
  if (remaining && remaining > 0) {
    scheduleAutoDismiss(id, remaining);
  }
}

export function useNotificationManager() {
  const [state, setState] = React.useState<NotificationState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        state.notifications.forEach((n) => {
          if (n.duration && n.duration > 0 && !n.isPaused) {
            pauseNotification(n.id);
          }
        });
      } else {
        state.notifications.forEach((n) => {
          if (n.isPaused) {
            resumeNotification(n.id);
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state.notifications]);

  return {
    notifications: state.notifications,
    show: showNotification,
    update: updateNotification,
    dismiss: dismissNotification,
    pause: pauseNotification,
    resume: resumeNotification,
  };
}

export { showNotification as notify };
