import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Share2, 
  Copy, 
  Check, 
  X, 
  Plus, 
  Loader2,
  Link2,
  Clock,
  AlertCircle
} from "lucide-react";

interface GuestLink {
  id: string;
  projectId: number;
  role: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
  shareUrl?: string;
}

interface ShareProjectModalProps {
  projectId: number;
  projectName: string;
}

export function ShareProjectModal({ projectId, projectName }: ShareProjectModalProps) {
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState("7");
  const [linkRole, setLinkRole] = useState<"viewer" | "contributor">("viewer");
  const { toast } = useToast();

  const { data: links, isLoading } = useQuery<GuestLink[]>({
    queryKey: ['/api/projects', projectId, 'guest-links'],
    enabled: open,
  });

  const createLinkMutation = useMutation({
    mutationFn: async () => {
      let expiresAt: string | undefined;
      if (hasExpiry) {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(expiryDays));
        expiresAt = date.toISOString();
      }
      
      const res = await apiRequest("POST", `/api/projects/${projectId}/guest-links`, {
        role: linkRole,
        expiresAt,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'guest-links'] });
      setShowCreateForm(false);
      setHasExpiry(false);
      setLinkRole("viewer");
      toast({
        title: "Share link created",
        description: "Copy the link to share with your vendor or customer.",
      });
      // Auto-copy the new link
      if (data.shareUrl) {
        navigator.clipboard.writeText(data.shareUrl);
        setCopiedId(data.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      await apiRequest("POST", `/api/guest-links/${linkId}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'guest-links'] });
      toast({
        title: "Link revoked",
        description: "This share link is no longer active.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to revoke link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyLink = async (link: GuestLink) => {
    const url = `${window.location.origin}/share/${link.id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Link copied",
      description: "Share link copied to clipboard.",
    });
  };

  const activeLinks = links?.filter(l => l.status === 'active') || [];
  const inactiveLinks = links?.filter(l => l.status !== 'active') || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-share-project">
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Project</DialogTitle>
          <DialogDescription>
            Create a link to share "{projectName}" with vendors or customers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Create new link section */}
          {!showCreateForm ? (
            <Button 
              onClick={() => setShowCreateForm(true)}
              variant="outline"
              className="w-full"
              data-testid="button-create-share-link"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Share Link
            </Button>
          ) : (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="space-y-2">
                <Label>Permission Level</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={linkRole === "viewer" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLinkRole("viewer")}
                    className="flex-1"
                    data-testid="button-role-viewer"
                  >
                    View Only
                  </Button>
                  <Button
                    type="button"
                    variant={linkRole === "contributor" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLinkRole("contributor")}
                    className="flex-1"
                    data-testid="button-role-contributor"
                  >
                    Contributor
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {linkRole === "viewer" 
                    ? "Can view project, areas, and photos. Cannot upload or edit."
                    : "Can upload photos, add annotations, and contribute to the project."}
                </p>
              </div>
              
              <div className="flex items-center justify-between">
                <Label>Set expiration?</Label>
                <Switch 
                  checked={hasExpiry} 
                  onCheckedChange={setHasExpiry}
                  data-testid="switch-expiry"
                />
              </div>
              
              {hasExpiry && (
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">Expires in</Label>
                  <Select value={expiryDays} onValueChange={setExpiryDays}>
                    <SelectTrigger className="w-32" data-testid="select-expiry-days">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  onClick={() => createLinkMutation.mutate()}
                  disabled={createLinkMutation.isPending}
                  data-testid="button-confirm-create-link"
                >
                  {createLinkMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4 mr-2" />
                  )}
                  Create Link
                </Button>
                <Button variant="ghost" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Active links */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {activeLinks.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Active Links</Label>
                  {activeLinks.map(link => (
                    <div 
                      key={link.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`link-item-${link.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="default" className="shrink-0">Active</Badge>
                          <Badge variant="secondary" className="shrink-0">
                            {link.role === "viewer" ? "View Only" : "Contributor"}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {link.id.slice(0, 8)}...
                          </span>
                        </div>
                        {link.expiresAt && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            Expires {new Date(link.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyLink(link)}
                          data-testid={`button-copy-link-${link.id}`}
                        >
                          {copiedId === link.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => revokeMutation.mutate(link.id)}
                          disabled={revokeMutation.isPending}
                          data-testid={`button-revoke-link-${link.id}`}
                        >
                          <X className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {inactiveLinks.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Inactive Links</Label>
                  {inactiveLinks.map(link => (
                    <div 
                      key={link.id} 
                      className="flex items-center justify-between p-3 border rounded-lg opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {link.status === 'revoked' ? 'Revoked' : 'Expired'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {link.id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {links?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No share links yet</p>
                  <p className="text-xs">Create a link to share this project</p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
