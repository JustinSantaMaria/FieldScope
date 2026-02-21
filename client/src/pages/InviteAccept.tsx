import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Users, Shield, AlertCircle, LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InviteValidation {
  valid: boolean;
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

interface User {
  id: string;
  email: string;
}

interface AcceptError {
  message: string;
  invitedEmail?: string;
  currentEmail?: string;
}

export default function InviteAccept() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<AcceptError | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  const { data: user, isLoading: userLoading, isSuccess: userQueryComplete } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        throw new Error("Failed to check authentication");
      }
      return res.json();
    },
    retry: false,
    staleTime: 0,
  });

  const authCheckComplete = userQueryComplete || !userLoading;
  const isLoggedIn = authCheckComplete && user !== null && user !== undefined;
  const isLoggedOut = authCheckComplete && (user === null || user === undefined);

  const { data: validation, isLoading: validationLoading, error: validationError } = useQuery<InviteValidation>({
    queryKey: ["/api/invitations/validate", token],
    queryFn: async () => {
      const res = await fetch(`/api/invitations/validate?token=${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to validate invitation");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invitations/accept", { token });
      if (!res.ok) {
        const errorData = await res.json();
        throw { status: res.status, ...errorData };
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Welcome to the team!",
        description: data.message || `You've joined as ${data.role}`,
      });
      setLocation("/");
    },
    onError: (err: any) => {
      setAcceptError({
        message: err.message || "Failed to accept invitation",
        invitedEmail: err.invitedEmail,
        currentEmail: err.currentEmail,
      });
      
      if (err.status !== 403) {
        toast({
          title: "Unable to accept invitation",
          description: err.message,
          variant: "destructive",
        });
      }
    },
  });

  const handleLogin = () => {
    const currentUrl = `/invite?token=${token}`;
    window.location.href = `/api/login?returnTo=${encodeURIComponent(currentUrl)}`;
  };

  const handleLogout = () => {
    const currentUrl = `/invite?token=${token}`;
    window.location.href = `/api/logout?returnTo=${encodeURIComponent(currentUrl)}`;
  };

  const handleAccept = () => {
    setAcceptError(null);
    acceptMutation.mutate();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground">No invitation token provided.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validationLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Validating invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validationError || !validation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Invitation Not Found</h2>
            <p className="text-muted-foreground">
              This invitation link is invalid or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!validation.valid) {
    const statusMessages: Record<string, { icon: JSX.Element; title: string; description: string }> = {
      expired: {
        icon: <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />,
        title: "Invitation Expired",
        description: "This invitation has expired. Please ask an admin to send you a new one.",
      },
      revoked: {
        icon: <XCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />,
        title: "Invitation Revoked",
        description: "This invitation has been cancelled. Please contact an admin for a new invitation.",
      },
      accepted: {
        icon: <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />,
        title: "Already Accepted",
        description: "This invitation has already been accepted. You may already be a member.",
      },
    };

    const status = statusMessages[validation.status] || {
      icon: <XCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />,
      title: "Invalid Invitation",
      description: "This invitation is no longer valid.",
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            {status.icon}
            <h2 className="text-xl font-semibold mb-2">{status.title}</h2>
            <p className="text-muted-foreground mb-4">{status.description}</p>
            {isLoggedIn && (
              <Button onClick={() => setLocation("/")} data-testid="button-go-home">
                Go to Dashboard
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
      case "admin":
        return <Shield className="w-5 h-5" />;
      default:
        return <Users className="w-5 h-5" />;
    }
  };

  const isWrongEmail = acceptError?.invitedEmail && acceptError?.currentEmail;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">You're Invited!</CardTitle>
          <CardDescription>
            You've been invited to join <span className="font-semibold text-foreground">{validation.organizationName}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Invited Email</span>
              <span className="text-sm font-medium">{validation.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="secondary" className="capitalize flex items-center gap-1">
                {getRoleIcon(validation.role)}
                {validation.role}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Expires</span>
              <span className="text-sm">{new Date(validation.expiresAt).toLocaleDateString()}</span>
            </div>
          </div>

          {isWrongEmail && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium mb-2">Wrong account</p>
              <p className="text-sm text-muted-foreground mb-3">
                You're signed in as <span className="font-medium">{acceptError.currentEmail}</span>, but this invitation was sent to <span className="font-medium">{acceptError.invitedEmail}</span>.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleLogout}
                data-testid="button-switch-account"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out and switch account
              </Button>
            </div>
          )}

          {!authCheckComplete ? (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Checking your account...</p>
            </div>
          ) : isLoggedIn && !isWrongEmail ? (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{user?.email}</span>
              </p>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleAccept}
                disabled={acceptMutation.isPending}
                data-testid="button-accept-invite"
              >
                {acceptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Accept Invitation
              </Button>
            </div>
          ) : isLoggedOut ? (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Sign in or create an account to accept this invitation
              </p>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleLogin}
                data-testid="button-login-to-accept"
              >
                Sign In to Accept
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
