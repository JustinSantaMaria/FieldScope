import {
  useNotificationManager,
  pauseNotification,
  resumeNotification,
  dismissNotification,
  type Notification,
  type NotificationAction,
} from "@/hooks/use-notification-manager";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToastAction,
} from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

function NotificationItem({ notification }: { notification: Notification }) {
  const handleMouseEnter = () => {
    if (notification.duration && notification.duration > 0) {
      pauseNotification(notification.id);
    }
  };

  const handleMouseLeave = () => {
    if (notification.duration && notification.duration > 0) {
      resumeNotification(notification.id);
    }
  };

  const variant = notification.type === "error" ? "destructive" : "default";

  return (
    <Toast
      key={notification.id}
      variant={variant}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          dismissNotification(notification.id);
        }
      }}
    >
      <div className="grid gap-1 flex-1">
        <ToastTitle>{notification.title}</ToastTitle>
        {notification.description && (
          <ToastDescription>{notification.description}</ToastDescription>
        )}
        {notification.actions && notification.actions.length > 0 && (
          <div className="flex gap-2 mt-2">
            {notification.actions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={action.variant === "destructive" ? "destructive" : "outline"}
                onClick={() => {
                  action.onClick();
                  if (action.label !== "View Details") {
                    dismissNotification(notification.id);
                  }
                }}
                data-testid={`notification-action-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <ToastClose />
    </Toast>
  );
}

export function NotificationToaster() {
  const { notifications } = useNotificationManager();

  return (
    <ToastProvider>
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
