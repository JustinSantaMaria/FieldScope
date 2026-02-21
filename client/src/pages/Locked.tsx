import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Lock, CreditCard, AlertCircle, Check, ArrowRight } from "lucide-react";

interface LockedProps {
  reason?: "trial_expired" | "payment_failed" | "subscription_cancelled";
}

const benefits = [
  "Unlimited projects and photos",
  "All annotation and measurement tools",
  "PDF and CSV exports",
  "Team collaboration",
  "Cloud storage",
  "Priority support",
];

export default function Locked({ reason = "trial_expired" }: LockedProps) {
  const getMessage = () => {
    switch (reason) {
      case "trial_expired":
        return {
          title: "Your Free Trial Has Ended",
          description: "Your 14-day trial has expired. Subscribe now to continue using FieldScope and keep access to all your projects and data.",
          icon: Lock,
        };
      case "payment_failed":
        return {
          title: "Payment Failed",
          description: "We couldn't process your payment. Please update your payment method to restore access to your account.",
          icon: CreditCard,
        };
      case "subscription_cancelled":
        return {
          title: "Subscription Cancelled",
          description: "Your subscription has been cancelled. Reactivate to regain access to your projects and data.",
          icon: AlertCircle,
        };
    }
  };

  const message = getMessage();
  const MessageIcon = message.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl">FieldScope</span>
          </div>
          <Link href="/api/logout">
            <Button variant="ghost" size="sm">Log Out</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <Card className="bg-card border-border">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                <MessageIcon className="w-8 h-8 text-destructive" />
              </div>
              
              <h1 className="text-2xl font-display font-bold text-foreground mb-3">
                {message.title}
              </h1>
              
              <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                {message.description}
              </p>

              <div className="bg-muted/30 rounded-lg p-6 mb-8 text-left">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-bold text-foreground">$25</span>
                  <span className="text-muted-foreground">/user/month</span>
                </div>
                <div className="space-y-2">
                  {benefits.map((benefit) => (
                    <div key={benefit} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-sm text-foreground">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Link href="/billing">
                  <Button size="lg" className="w-full bg-primary" data-testid="button-upgrade">
                    {reason === "payment_failed" ? "Update Payment Method" : "Subscribe Now"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                
                {reason === "trial_expired" && (
                  <p className="text-xs text-muted-foreground">
                    Your data is safe. Subscribe anytime to restore full access.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Need help?{" "}
              <a href="mailto:support@fieldscope.app" className="text-primary hover:underline">
                Contact Support
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
