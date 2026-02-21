import { Switch, Route, useLocation, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { NotificationToaster } from "@/components/ui/notification-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GuestProvider, useGuestOptional } from "@/lib/guest-context";
import { ShareProvider } from "@/lib/share-context";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import InviteAccept from "@/pages/InviteAccept";
import Home from "@/pages/Home";
import Archive from "@/pages/Archive";
import ProjectDetail from "@/pages/ProjectDetail";
import AreaDetail from "@/pages/AreaDetail";
import PhotoDetail from "@/pages/PhotoDetail";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import Exports from "@/pages/Exports";
import Team from "@/pages/Team";
import Trash from "@/pages/Trash";
import Locked from "@/pages/Locked";
import Integrations from "@/pages/Integrations";
import GuestShare from "@/pages/GuestShare";
import GuestLinks from "@/pages/GuestLinks";
import { useAuth } from "@/hooks/use-auth";

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/landing" component={Landing} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/invite" component={InviteAccept} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GuestRouter() {
  return (
    <Switch>
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/areas/:id" component={AreaDetail} />
      <Route path="/photos/:id" component={PhotoDetail} />
      <Route path="/share/:linkId" component={GuestShare} />
      <Route>
        {() => (
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="text-center space-y-4">
              <h1 className="text-xl font-semibold">Access Restricted</h1>
              <p className="text-muted-foreground">
                As a guest, you can only view the shared project.
              </p>
            </div>
          </div>
        )}
      </Route>
    </Switch>
  );
}

function AuthenticatedRouter() {
  const { user } = useAuth();
  const [location] = useLocation();
  
  const publicOnlyPaths = ["/landing", "/pricing", "/privacy", "/terms"];
  const isPublicPage = publicOnlyPaths.includes(location);
  
  if (isPublicPage) {
    return (
      <Switch>
        <Route path="/landing" component={Landing} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
      </Switch>
    );
  }
  
  const isTrialExpired = user?.trialEndsAt && new Date(user.trialEndsAt) < new Date() && !user.stripeSubscriptionId;
  
  if (isTrialExpired) {
    return <Locked />;
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/archive" component={Archive} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/areas/:id" component={AreaDetail} />
      <Route path="/photos/:id" component={PhotoDetail} />
      <Route path="/settings/integrations" component={Integrations} />
      <Route path="/settings" component={Settings} />
      <Route path="/billing" component={Billing} />
      <Route path="/exports" component={Exports} />
      <Route path="/trash" component={Trash} />
      <Route path="/team" component={Team} />
      <Route path="/guest-links" component={GuestLinks} />
      <Route path="/invite" component={InviteAccept} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ShareRouterContent() {
  return (
    <Switch>
      <Route path="/share/:linkId/project" component={ProjectDetail} />
      <Route path="/share/:linkId/area/:areaId" component={AreaDetail} />
      <Route path="/share/:linkId/photo/:photoId" component={PhotoDetail} />
      <Route path="/share/:linkId">{() => <GuestShare />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ShareRouter() {
  const [location] = useLocation();
  const linkIdMatch = location.match(/^\/share\/([^/]+)/);
  const linkId = linkIdMatch ? linkIdMatch[1] : "";
  
  if (!linkId) {
    return <NotFound />;
  }
  
  if (location === `/share/${linkId}`) {
    return <GuestShare />;
  }
  
  return (
    <ShareProvider linkId={linkId}>
      <ShareRouterContent />
    </ShareProvider>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const guestContext = useGuestOptional();
  const guest = guestContext?.guest;
  const isShareSession = guestContext?.isShareSession ?? false;
  const shareSessionChecked = guestContext?.shareSessionChecked ?? false;

  if (location.startsWith("/share/")) {
    return <ShareRouter />;
  }

  if (!shareSessionChecked && !location.startsWith("/share/")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isShareSession || guest) {
    return <GuestRouter />;
  }

  const publicPaths = ["/", "/pricing", "/privacy", "/terms"];
  const isPublicPath = publicPaths.includes(location);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <PublicRouter />;
  }

  return <AuthenticatedRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GuestProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
          <NotificationToaster />
        </TooltipProvider>
      </GuestProvider>
    </QueryClientProvider>
  );
}

export default App;
