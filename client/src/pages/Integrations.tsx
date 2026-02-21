import { LayoutShell } from "@/components/layout-shell";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Cloud, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ExternalLink, 
  FolderOpen, 
  Upload, 
  RefreshCw, 
  ChevronDown,
  Copy,
  Info,
  Lock,
} from "lucide-react";
import { SiGoogledrive, SiDropbox } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface Integration {
  id: number;
  orgId: number;
  provider: string;
  status: string;
  accountEmail: string | null;
  accountName: string | null;
  selectedFolderId: string | null;
  selectedFolderPath: string | null;
  selectedFolderDisplayPath: string | null;
  connectedByUserId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface IntegrationConfig {
  redirectUris: {
    google_drive: { staging: string | null; production: string | null };
    onedrive: { staging: string | null; production: string | null };
    dropbox: { staging: string | null; production: string | null };
  };
  missingEnvVars: string[];
  providerStatus: {
    google_drive: { configured: boolean; missing: string[] };
    onedrive: { configured: boolean; missing: string[] };
    dropbox: { configured: boolean; missing: string[] };
  };
  encryptionConfigured: boolean;
  stagingUrl: string | null;
  productionUrl: string | null;
}

interface User {
  id: string;
  role: string;
}

type ProviderKey = "google_drive" | "onedrive" | "dropbox";

const PROVIDER_INFO: Record<ProviderKey, { name: string; icon: any; color: string }> = {
  google_drive: { name: "Google Drive", icon: SiGoogledrive, color: "text-blue-500" },
  onedrive: { name: "OneDrive", icon: Cloud, color: "text-sky-500" },
  dropbox: { name: "Dropbox", icon: SiDropbox, color: "text-blue-600" },
};

function getStatusBadge(status: string) {
  switch (status) {
    case "ready":
      return <Badge variant="default" className="bg-green-600">Ready</Badge>;
    case "connected":
      return <Badge variant="secondary">Connected (select folder)</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">Disconnected</Badge>;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "ready":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "connected":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    case "error":
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Cloud className="h-5 w-5 text-muted-foreground" />;
  }
}

function ProviderCard({ 
  provider, 
  integration, 
  config, 
  isAdmin,
  onConnect,
  onSetFolder,
  onTestUpload,
  onDisconnect,
}: { 
  provider: ProviderKey;
  integration: Integration | undefined;
  config: IntegrationConfig | undefined;
  isAdmin: boolean;
  onConnect: () => void;
  onSetFolder: (folderId: string) => void;
  onTestUpload: () => void;
  onDisconnect: () => void;
}) {
  const info = PROVIDER_INFO[provider];
  const Icon = info.icon;
  const [folderInput, setFolderInput] = useState("");
  const [showSetupHelp, setShowSetupHelp] = useState(false);
  const { toast } = useToast();
  
  const status = integration?.status || "disconnected";
  const isConfigured = config?.providerStatus[provider]?.configured ?? false;
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Redirect URI copied to clipboard" });
  };

  const getStepNumber = () => {
    if (status === "disconnected") return 1;
    if (status === "connected" && !integration?.selectedFolderId) return 2;
    if (status === "connected" && integration?.selectedFolderId) return 3;
    if (status === "ready") return 4;
    return 1;
  };

  const stepNumber = getStepNumber();

  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Icon className={`h-8 w-8 ${info.color}`} />
            <div>
              <CardTitle className="text-lg">{info.name}</CardTitle>
              <CardDescription>
                {status === "ready" && "Sync exports to your cloud storage"}
                {status === "connected" && "Complete setup to enable sync"}
                {status === "error" && "Connection error - please reconnect"}
                {status === "disconnected" && "Connect your account to enable sync"}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(status)}
            {getStatusBadge(status)}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isAdmin && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Admin access required to change integration settings.
            </AlertDescription>
          </Alert>
        )}

        {integration?.accountEmail && (
          <div className="text-sm">
            <span className="text-muted-foreground">Connected as: </span>
            <span className="font-medium">{integration.accountEmail}</span>
            {integration.connectedAt && (
              <span className="text-muted-foreground">
                {" "}on {new Date(integration.connectedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {integration?.selectedFolderDisplayPath && (
          <div className="text-sm flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Folder: </span>
            <span className="font-medium font-mono text-xs bg-muted px-2 py-1 rounded">
              {integration.selectedFolderDisplayPath}
            </span>
          </div>
        )}

        {integration?.lastSyncAt && (
          <div className="text-sm text-muted-foreground">
            Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
          </div>
        )}

        {integration?.errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{integration.errorMessage}</AlertDescription>
          </Alert>
        )}

        {!isConfigured && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This provider is not configured. Missing: {config?.providerStatus[provider]?.missing.join(", ")}
            </AlertDescription>
          </Alert>
        )}

        {isAdmin && status === "disconnected" && isConfigured && (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">Step 1</Badge>
              <span className="text-sm font-medium">Connect your account</span>
            </div>
            <Button onClick={onConnect} data-testid={`button-connect-${provider}`}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect {info.name}
            </Button>
          </div>
        )}

        {isAdmin && status === "connected" && !integration?.selectedFolderId && (
          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 2</Badge>
              <span className="text-sm font-medium">Choose destination folder</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`folder-${provider}`}>
                {provider === "google_drive" && "Paste folder URL or ID"}
                {provider === "dropbox" && "Enter folder path (e.g., /FieldScope)"}
                {provider === "onedrive" && "Enter folder path"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`folder-${provider}`}
                  placeholder={
                    provider === "google_drive" 
                      ? "https://drive.google.com/drive/folders/..." 
                      : "/FieldScope"
                  }
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  data-testid={`input-folder-${provider}`}
                />
                <Button 
                  onClick={() => onSetFolder(folderInput)}
                  disabled={!folderInput.trim()}
                  data-testid={`button-set-folder-${provider}`}
                >
                  Set Folder
                </Button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && status === "connected" && integration?.selectedFolderId && (
          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 3</Badge>
              <span className="text-sm font-medium">Test upload</span>
            </div>
            <Button onClick={onTestUpload} variant="secondary" data-testid={`button-test-upload-${provider}`}>
              <Upload className="h-4 w-4 mr-2" />
              Test Upload
            </Button>
          </div>
        )}

        {status === "ready" && (
          <div className="pt-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Ready to sync exports</span>
            </div>
          </div>
        )}

        <Collapsible open={showSetupHelp} onOpenChange={setShowSetupHelp}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between" data-testid={`button-setup-help-${provider}`}>
              <span className="text-xs text-muted-foreground">Setup Help</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showSetupHelp ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="text-xs space-y-2">
              <p className="font-medium">Redirect URIs (add these to your OAuth app):</p>
              {config?.redirectUris[provider]?.staging && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Staging</Badge>
                  <code className="flex-1 bg-muted px-2 py-1 rounded text-xs break-all">
                    {config.redirectUris[provider].staging}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(config.redirectUris[provider].staging!)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {config?.redirectUris[provider]?.production && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Production</Badge>
                  <code className="flex-1 bg-muted px-2 py-1 rounded text-xs break-all">
                    {config.redirectUris[provider].production}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(config.redirectUris[provider].production!)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {provider === "google_drive" && (
                <p className="text-muted-foreground pt-2">
                  Folder format: Paste a Google Drive folder URL or just the folder ID.
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      {isAdmin && status !== "disconnected" && (
        <CardFooter className="border-t pt-4 flex justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {status === "ready" && (
              <Button variant="outline" size="sm" onClick={() => onSetFolder("")} data-testid={`button-change-folder-${provider}`}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Change Folder
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onConnect} data-testid={`button-reconnect-${provider}`}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reconnect
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onDisconnect} className="text-destructive" data-testid={`button-disconnect-${provider}`}>
            Disconnect
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default function Integrations() {
  const { toast } = useToast();
  const [location] = useLocation();
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    
    if (success) {
      toast({ title: "Connected!", description: `${success.replace(/_/g, " ")} successfully` });
      window.history.replaceState({}, "", "/settings/integrations");
    }
    if (error) {
      toast({ title: "Connection Error", description: error, variant: "destructive" });
      window.history.replaceState({}, "", "/settings/integrations");
    }
  }, []);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const { data: config, isLoading: configLoading } = useQuery<IntegrationConfig>({
    queryKey: ["/api/integrations/config"],
  });

  const isAdmin = user?.role === "admin";

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest("POST", `/api/integrations/${provider}/connect`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (error: any) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const folderMutation = useMutation({
    mutationFn: async ({ provider, folderId }: { provider: string; folderId: string }) => {
      return apiRequest("POST", `/api/integrations/${provider}/folder`, { folderId });
    },
    onSuccess: () => {
      toast({ title: "Folder Set", description: "Destination folder has been configured" });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const testUploadMutation = useMutation({
    mutationFn: async (provider: string) => {
      return apiRequest("POST", `/api/integrations/${provider}/test-upload`);
    },
    onSuccess: () => {
      toast({ title: "Test Upload Successful", description: "A test file was uploaded to your folder" });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: any) => {
      toast({ title: "Test Upload Failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      return apiRequest("POST", `/api/integrations/${provider}/disconnect`);
    },
    onSuccess: (_, provider) => {
      toast({ title: "Disconnected", description: `${PROVIDER_INFO[provider as ProviderKey].name} has been disconnected` });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const getIntegration = (provider: ProviderKey) => {
    return integrations?.find(i => i.provider === provider);
  };

  if (integrationsLoading || configLoading) {
    return (
      <LayoutShell>
        <div className="container mx-auto p-6">
          <div className="animate-pulse text-muted-foreground">Loading integrations...</div>
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Cloud Storage Integrations</h1>
          <p className="text-muted-foreground">
            Connect your cloud storage to sync exports and photos automatically.
          </p>
        </div>

        {config?.missingEnvVars && config.missingEnvVars.length > 0 && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>System configuration required:</strong> Missing environment variables: {config.missingEnvVars.join(", ")}
            </AlertDescription>
          </Alert>
        )}

        {!config?.encryptionConfigured && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              TOKEN_ENCRYPTION_KEY is not configured. Integrations cannot be enabled until this is set.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            <strong>Sync Policy:</strong> Files are overwritten if they already exist (idempotent sync).
          </p>
        </div>

        <div className="space-y-6">
          <ProviderCard
            provider="google_drive"
            integration={getIntegration("google_drive")}
            config={config}
            isAdmin={isAdmin}
            onConnect={() => connectMutation.mutate("google_drive")}
            onSetFolder={(folderId) => folderMutation.mutate({ provider: "google_drive", folderId })}
            onTestUpload={() => testUploadMutation.mutate("google_drive")}
            onDisconnect={() => disconnectMutation.mutate("google_drive")}
          />

          <ProviderCard
            provider="onedrive"
            integration={getIntegration("onedrive")}
            config={config}
            isAdmin={isAdmin}
            onConnect={() => connectMutation.mutate("onedrive")}
            onSetFolder={(folderId) => folderMutation.mutate({ provider: "onedrive", folderId })}
            onTestUpload={() => testUploadMutation.mutate("onedrive")}
            onDisconnect={() => disconnectMutation.mutate("onedrive")}
          />

          <ProviderCard
            provider="dropbox"
            integration={getIntegration("dropbox")}
            config={config}
            isAdmin={isAdmin}
            onConnect={() => connectMutation.mutate("dropbox")}
            onSetFolder={(folderId) => folderMutation.mutate({ provider: "dropbox", folderId })}
            onTestUpload={() => testUploadMutation.mutate("dropbox")}
            onDisconnect={() => disconnectMutation.mutate("dropbox")}
          />
        </div>
      </div>
    </LayoutShell>
  );
}
