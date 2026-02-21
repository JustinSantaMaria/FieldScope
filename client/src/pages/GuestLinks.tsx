import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Link2, 
  Copy, 
  Check, 
  X, 
  Loader2, 
  Search,
  ExternalLink,
  Clock,
  User,
  FolderOpen,
  AlertCircle,
  Crown
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

interface PlanInfo {
  usage: {
    activeGuestLinks: number;
    guestLinksCap: number;
    guestLinksPercent: number;
  };
}

interface GuestLink {
  id: string;
  projectId: number;
  projectName: string;
  role: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdByName: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export default function GuestLinks() {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeDialogId, setRevokeDialogId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: links, isLoading } = useQuery<GuestLink[]>({
    queryKey: ['/api/guest-links'],
  });

  const { data: planInfo } = useQuery<PlanInfo>({
    queryKey: ['/api/plan'],
  });

  const revokeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      await apiRequest("POST", `/api/guest-links/${linkId}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guest-links'] });
      setRevokeDialogId(null);
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

  const copyLink = async (linkId: string) => {
    const url = `${window.location.origin}/share/${linkId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: "Link copied",
        description: "Share link has been copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Could not copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const filteredLinks = links?.filter(link => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      link.projectName.toLowerCase().includes(searchLower) ||
      link.id.toLowerCase().includes(searchLower) ||
      (link.createdByName && link.createdByName.toLowerCase().includes(searchLower))
    );
  }) || [];

  const activeCount = links?.filter(l => l.status === 'active').length || 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const linkToRevoke = links?.find(l => l.id === revokeDialogId);

  return (
    <LayoutShell>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Guest Links</h1>
            <p className="text-muted-foreground mt-1">
              Manage shareable links for external vendors and customers
            </p>
          </div>
          {planInfo?.usage && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Active links</p>
                <p className={`font-medium ${planInfo.usage.guestLinksPercent >= 100 ? 'text-destructive' : ''}`}>
                  {planInfo.usage.activeGuestLinks} / {planInfo.usage.guestLinksCap}
                </p>
              </div>
              {planInfo.usage.guestLinksPercent >= 100 && (
                <Link href="/billing">
                  <Button size="sm" data-testid="button-upgrade-guest-links">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>

        {planInfo?.usage && planInfo.usage.guestLinksPercent >= 100 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-yellow-700 dark:text-yellow-300">
                Guest link limit reached
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                You've used all {planInfo.usage.guestLinksCap} active guest links in your plan. 
                Revoke existing links or upgrade your plan to create more.
              </p>
            </div>
            <Link href="/billing">
              <Button variant="outline" size="sm" data-testid="button-add-guest-links-addon">
                Add More Links
              </Button>
            </Link>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>All Guest Links</CardTitle>
                <CardDescription>
                  View and manage all guest access links across your projects
                </CardDescription>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by project or creator..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-links"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLinks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No guest links found</p>
                <p className="text-sm mt-1">
                  {search 
                    ? "Try adjusting your search" 
                    : "Create a share link from any project to get started"
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLinks.map((link) => (
                      <TableRow key={link.id} data-testid={`row-guest-link-${link.id}`}>
                        <TableCell>
                          <Link 
                            href={`/projects/${link.projectId}`}
                            className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
                          >
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{link.projectName}</span>
                          </Link>
                        </TableCell>
                        <TableCell>{getStatusBadge(link.status)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {link.role === "viewer" ? "View Only" : "Contributor"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {link.createdByName ? (
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span>{link.createdByName}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {format(new Date(link.createdAt), "MMM d, yyyy")}
                          </span>
                        </TableCell>
                        <TableCell>
                          {link.expiresAt ? (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {format(new Date(link.expiresAt), "MMM d, yyyy")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No expiry</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {link.status === 'active' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => copyLink(link.id)}
                                  data-testid={`button-copy-link-${link.id}`}
                                  title="Copy link"
                                >
                                  {copiedId === link.id ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => window.open(`/share/${link.id}`, '_blank')}
                                  data-testid={`button-open-link-${link.id}`}
                                  title="Open link"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setRevokeDialogId(link.id)}
                                  data-testid={`button-revoke-link-${link.id}`}
                                  title="Revoke link"
                                >
                                  <X className="w-4 h-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!revokeDialogId} onOpenChange={(open) => !open && setRevokeDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Guest Link</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this link for "{linkToRevoke?.projectName}"? 
              Anyone using this link will immediately lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeDialogId && revokeMutation.mutate(revokeDialogId)}
              className="bg-destructive text-destructive-foreground"
            >
              {revokeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Revoke Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LayoutShell>
  );
}
