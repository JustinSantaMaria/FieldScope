import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, UserPlus, Mail, Shield, MoreVertical, Loader2, Copy, RefreshCw, X, Clock, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface TeamMember {
  id: number;
  userId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
  avatarUrl?: string;
  joinedAt: string;
}

interface PendingInvitation {
  id: number;
  email: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
  expiresAt: string;
}

interface TeamData {
  organizationId: number;
  organizationName: string;
  members: TeamMember[];
  invitations: PendingInvitation[];
}

interface InviteResponse {
  inviteId: number;
  inviteUrl: string;
  email: string;
  role: string;
  expiresAt: string;
  emailSent?: boolean;
  message?: string;
}

export default function Team() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data: teamData, isLoading, error } = useQuery<TeamData>({
    queryKey: ["/api/team"],
  });

  const createInviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest("POST", "/api/team/invitations", data);
      return res.json() as Promise<InviteResponse>;
    },
    onSuccess: (data) => {
      setInviteResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "Invitation created",
        description: data.emailSent 
          ? `Email sent to ${data.email}` 
          : "Share the invite link with your team member",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create invitation", description: err.message, variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("POST", `/api/team/invitations/${inviteId}/resend`);
      return res.json() as Promise<InviteResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      navigator.clipboard.writeText(data.inviteUrl);
      toast({
        title: "New invite link generated",
        description: "Link copied to clipboard",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to resend", description: err.message, variant: "destructive" });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      await apiRequest("POST", `/api/team/invitations/${inviteId}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Invitation revoked" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to revoke", description: err.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PATCH", `/api/team/members/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/team/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Member removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast({ title: "Please enter an email address", variant: "destructive" });
      return;
    }
    createInviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const handleCopyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  const handleCloseInviteDialog = () => {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteResult(null);
    setCopiedLink(false);
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner": return "default";
      case "admin": return "secondary";
      default: return "outline";
    }
  };

  const activeMembers = teamData?.members?.length ?? 0;
  const pendingInvites = teamData?.invitations?.length ?? 0;

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </LayoutShell>
    );
  }

  if (error) {
    return (
      <LayoutShell>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Failed to load team data</p>
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Team Management</h1>
          <p className="text-muted-foreground">
            {teamData?.organizationName ? `Manage ${teamData.organizationName} team` : "Manage users and permissions"}
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={(open) => open ? setInviteOpen(true) : handleCloseInviteDialog()}>
          <DialogTrigger asChild>
            <Button className="bg-primary" data-testid="button-invite-user">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your team
              </DialogDescription>
            </DialogHeader>
            
            {inviteResult ? (
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">Invitation Created</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {inviteResult.emailSent 
                    ? `An email has been sent to ${inviteResult.email}` 
                    : "Share this link with your team member:"}
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteResult.inviteUrl}
                    className="font-mono text-xs"
                    data-testid="input-invite-url"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleCopyLink(inviteResult.inviteUrl)}
                    data-testid="button-copy-invite-link"
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link expires on {new Date(inviteResult.expiresAt).toLocaleDateString()}
                </p>
                <Button className="w-full" onClick={handleCloseInviteDialog}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    data-testid="input-invite-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "member")}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Team Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Admins can manage team members and settings. Team members can create and edit projects.
                  </p>
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleInvite}
                  disabled={createInviteMutation.isPending}
                  data-testid="button-send-invite"
                >
                  {createInviteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Send Invitation
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeMembers}</p>
                <p className="text-sm text-muted-foreground">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingInvites}</p>
                <p className="text-sm text-muted-foreground">Pending Invites</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeMembers}</p>
                <p className="text-sm text-muted-foreground">Seats Used</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border mb-6">
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Manage your team's access and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {teamData?.members?.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No team members yet</p>
            )}
            {teamData?.members?.map((member) => (
              <div 
                key={member.id} 
                className="flex items-center justify-between p-4 rounded-lg border border-border"
                data-testid={`team-member-${member.userId}`}
              >
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={member.avatarUrl} />
                    <AvatarFallback>{getInitials(member.name || member.email)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{member.name || member.email}</p>
                      <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs capitalize">
                        {member.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                  </span>
                  {member.role !== "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-member-menu-${member.userId}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.role === "member" && (
                          <DropdownMenuItem 
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "admin" })}
                          >
                            Make Admin
                          </DropdownMenuItem>
                        )}
                        {member.role === "admin" && (
                          <DropdownMenuItem 
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "member" })}
                          >
                            Remove Admin
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => removeMemberMutation.mutate(member.userId)}
                          className="text-destructive"
                        >
                          Remove from Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(teamData?.invitations?.length ?? 0) > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>Invitations awaiting acceptance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamData?.invitations?.map((invite) => (
                <div 
                  key={invite.id} 
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
                  data-testid={`pending-invite-${invite.id}`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback className="bg-yellow-500/10 text-yellow-600">
                        <Mail className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground">{invite.email}</p>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {invite.role}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sent {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })} · 
                        Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendInviteMutation.mutate(invite.id)}
                      disabled={resendInviteMutation.isPending}
                      data-testid={`button-resend-${invite.id}`}
                    >
                      {resendInviteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Resend
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeInviteMutation.mutate(invite.id)}
                      disabled={revokeInviteMutation.isPending}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-revoke-${invite.id}`}
                    >
                      {revokeInviteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </LayoutShell>
  );
}
