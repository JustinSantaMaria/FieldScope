import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Check, 
  X, 
  Loader2, 
  CreditCard, 
  ExternalLink, 
  Zap,
  HardDrive,
  FileOutput,
  Link2,
  Building2,
  Cloud,
  Crown,
  AlertCircle,
  Plus,
  Settings
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface PlanInfo {
  organizationId: number;
  plan: "starter" | "pro" | "business";
  caps: {
    priceMonthly: number;
    priceYearly: number;
    storageBytes: number;
    monthlyExports: number;
    activeGuestLinks: number;
    allowedExportTypes: readonly string[];
    branding: "none" | "fieldscope" | "custom";
    cloudSync: boolean;
  };
  usage: {
    storageUsedBytes: number;
    storageCapBytes: number;
    storagePercent: number;
    exportsThisMonth: number;
    exportsCapMonthly: number;
    exportsPercent: number;
    activeGuestLinks: number;
    guestLinksCap: number;
    guestLinksPercent: number;
  };
}

interface SubscriptionStatus {
  isActive: boolean;
  isTrialing: boolean;
  trialEndsAt: string | null;
  status: string | null;
}

interface AddonSelection {
  guestLinksMode: "none" | "per_link" | "unlimited";
  guestLinksQty: number;
  storageTier: "none" | "200gb" | "1tb";
  exportsTier: "none" | "plus200";
  isActive: boolean;
}

interface AddonsData {
  currentSelection: AddonSelection;
  billingConfigured: boolean;
  requiredEnvVars: string[];
}

interface PlanFeature {
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  storage: string;
  exports: string;
  guestLinks: string;
  exportTypes: string;
  branding: string;
  cloudSync: boolean;
  popular?: boolean;
  features: { text: string; included: boolean }[];
}

const PLAN_FEATURES: Record<string, PlanFeature> = {
  starter: {
    name: "Starter",
    description: "Perfect for solo users and small volume",
    priceMonthly: 29,
    priceYearly: 290,
    storage: "25 GB",
    exports: "20 / month",
    guestLinks: "1 active",
    exportTypes: "ZIP only",
    branding: "N/A",
    cloudSync: false,
    features: [
      { text: "Photo capture with GPS", included: true },
      { text: "Canvas annotations & dimensions", included: true },
      { text: "ZIP photo exports", included: true },
      { text: "PDF reports", included: false },
      { text: "Excel exports", included: false },
      { text: "Full export package", included: false },
      { text: "Cloud sync (Drive/Dropbox)", included: false },
      { text: "Custom branding", included: false },
    ],
  },
  pro: {
    name: "Pro",
    description: "For teams with higher volume needs",
    priceMonthly: 79,
    priceYearly: 790,
    storage: "250 GB",
    exports: "200 / month",
    guestLinks: "5 active",
    exportTypes: "ZIP + PDF + Excel",
    branding: "FieldScope branded",
    cloudSync: true,
    popular: true,
    features: [
      { text: "Photo capture with GPS", included: true },
      { text: "Canvas annotations & dimensions", included: true },
      { text: "ZIP photo exports", included: true },
      { text: "PDF reports", included: true },
      { text: "Excel exports", included: true },
      { text: "Full export package", included: true },
      { text: "Cloud sync (Drive/Dropbox)", included: true },
      { text: "Custom branding", included: false },
    ],
  },
  business: {
    name: "Business",
    description: "White-label with custom branding",
    priceMonthly: 149,
    priceYearly: 1490,
    storage: "1 TB",
    exports: "1,000 / month",
    guestLinks: "20 active",
    exportTypes: "ZIP + PDF + Excel",
    branding: "Custom company branding",
    cloudSync: true,
    features: [
      { text: "Photo capture with GPS", included: true },
      { text: "Canvas annotations & dimensions", included: true },
      { text: "ZIP photo exports", included: true },
      { text: "PDF reports", included: true },
      { text: "Excel exports", included: true },
      { text: "Full export package", included: true },
      { text: "Cloud sync (Drive/Dropbox)", included: true },
      { text: "Custom branding", included: true },
    ],
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function Billing() {
  const [location] = useLocation();
  const [isAnnual, setIsAnnual] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{ plan: string; action: string } | null>(null);
  const [showAddonReview, setShowAddonReview] = useState(false);
  const { toast } = useToast();
  
  const [addonSelection, setAddonSelection] = useState<Omit<AddonSelection, 'isActive'>>({
    guestLinksMode: "none",
    guestLinksQty: 0,
    storageTier: "none",
    exportsTier: "none",
  });
  
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const success = searchParams.get('success') === '1';
  const canceled = searchParams.get('canceled') === '1';

  const { data: planInfo, isLoading: planLoading } = useQuery<PlanInfo>({
    queryKey: ['/api/plan'],
  });

  const { data: subscription, isLoading: subLoading } = useQuery<SubscriptionStatus>({
    queryKey: ['/api/billing/subscription'],
  });

  const { data: addonsData, isLoading: addonsLoading } = useQuery<AddonsData>({
    queryKey: ['/api/addons'],
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/billing/portal');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const addonSelectionMutation = useMutation({
    mutationFn: async (selection: typeof addonSelection) => {
      const res = await apiRequest('POST', '/api/addons/selection', selection);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/addons'] });
      queryClient.invalidateQueries({ queryKey: ['/api/plan'] });
      toast({
        title: "Add-ons updated",
        description: `Monthly cost: $${data.monthlyCost}. Complete checkout to activate.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update add-ons",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handlePlanAction = (planKey: string, action: string) => {
    setSelectedAction({ plan: planKey, action });
    setShowBillingModal(true);
  };

  const calculateAddonCost = () => {
    let total = 0;
    if (addonSelection.guestLinksMode === "unlimited") {
      total += 49;
    } else if (addonSelection.guestLinksMode === "per_link" && addonSelection.guestLinksQty > 0) {
      total += 5 * addonSelection.guestLinksQty;
    }
    if (addonSelection.storageTier === "200gb") total += 20;
    if (addonSelection.storageTier === "1tb") total += 50;
    if (addonSelection.exportsTier === "plus200") total += 10;
    return total;
  };

  const hasAddonChanges = () => {
    if (!addonsData) return false;
    const current = addonsData.currentSelection;
    return (
      addonSelection.guestLinksMode !== current.guestLinksMode ||
      addonSelection.guestLinksQty !== current.guestLinksQty ||
      addonSelection.storageTier !== current.storageTier ||
      addonSelection.exportsTier !== current.exportsTier
    );
  };

  if (planLoading || subLoading) {
    return (
      <LayoutShell title="Billing">
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loader-billing" />
        </div>
      </LayoutShell>
    );
  }

  const currentPlan = planInfo?.plan || "starter";
  const isActive = subscription?.isActive;
  const isTrialing = subscription?.isTrialing;

  const getPlanButtonState = (planKey: string) => {
    const planOrder = { starter: 0, pro: 1, business: 2 };
    const currentOrder = planOrder[currentPlan as keyof typeof planOrder];
    const targetOrder = planOrder[planKey as keyof typeof planOrder];
    
    if (planKey === currentPlan) {
      return { label: "Current Plan", disabled: true, variant: "secondary" as const };
    } else if (targetOrder > currentOrder) {
      return { label: "Upgrade", disabled: false, variant: "default" as const };
    } else {
      return { label: "Downgrade", disabled: false, variant: "outline" as const };
    }
  };

  return (
    <LayoutShell title="Billing">
      <div className="max-w-6xl mx-auto space-y-8">
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-700 dark:text-green-300">
            Subscription activated successfully. Welcome to FieldScope!
          </div>
        )}
        
        {canceled && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-yellow-700 dark:text-yellow-300">
            Checkout was canceled. No charges were made.
          </div>
        )}

        {/* Current Subscription Card */}
        {isActive && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Current Subscription
              </CardTitle>
              <CardDescription>
                You have an active subscription
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={isTrialing ? "secondary" : "default"} className="capitalize">
                  {currentPlan} Plan
                </Badge>
                <Badge variant={isTrialing ? "secondary" : "default"}>
                  {subscription?.status === 'trialing' ? 'Trial' : 'Active'}
                </Badge>
                {isTrialing && subscription?.trialEndsAt && (
                  <span className="text-sm text-muted-foreground">
                    Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              
              <Button 
                variant="outline" 
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="button-manage-subscription"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Manage Subscription
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Usage Section */}
        {planInfo?.usage && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Current Usage
              </CardTitle>
              <CardDescription>
                Your usage this billing period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                {/* Storage Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-muted-foreground" />
                      Storage
                    </span>
                    <span className={planInfo.usage.storagePercent >= 90 ? "text-destructive font-medium" : ""}>
                      {formatBytes(planInfo.usage.storageUsedBytes)} / {formatBytes(planInfo.usage.storageCapBytes)}
                    </span>
                  </div>
                  <Progress 
                    value={planInfo.usage.storagePercent} 
                    className={planInfo.usage.storagePercent >= 90 ? "[&>div]:bg-destructive" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    {planInfo.usage.storagePercent}% used
                  </p>
                </div>

                {/* Exports Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <FileOutput className="w-4 h-4 text-muted-foreground" />
                      Exports This Month
                    </span>
                    <span className={planInfo.usage.exportsPercent >= 90 ? "text-destructive font-medium" : ""}>
                      {planInfo.usage.exportsThisMonth} / {planInfo.usage.exportsCapMonthly}
                    </span>
                  </div>
                  <Progress 
                    value={planInfo.usage.exportsPercent} 
                    className={planInfo.usage.exportsPercent >= 90 ? "[&>div]:bg-destructive" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    {planInfo.usage.exportsCapMonthly - planInfo.usage.exportsThisMonth} remaining
                  </p>
                </div>

                {/* Guest Links Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                      Active Guest Links
                    </span>
                    <span className={planInfo.usage.guestLinksPercent >= 100 ? "text-destructive font-medium" : ""}>
                      {planInfo.usage.activeGuestLinks} / {planInfo.usage.guestLinksCap}
                    </span>
                  </div>
                  <Progress 
                    value={planInfo.usage.guestLinksPercent} 
                    className={planInfo.usage.guestLinksPercent >= 100 ? "[&>div]:bg-destructive" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    {Math.max(0, planInfo.usage.guestLinksCap - planInfo.usage.activeGuestLinks)} available
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4">
          <Label htmlFor="billing-toggle" className={!isAnnual ? "font-semibold" : "text-muted-foreground"}>
            Monthly
          </Label>
          <Switch
            id="billing-toggle"
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
            data-testid="switch-billing-period"
          />
          <Label htmlFor="billing-toggle" className={isAnnual ? "font-semibold" : "text-muted-foreground"}>
            Annual
            <Badge variant="secondary" className="ml-2 text-xs">
              Save ~17%
            </Badge>
          </Label>
        </div>

        {/* Plan Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {Object.entries(PLAN_FEATURES).map(([planKey, plan]) => {
            const buttonState = getPlanButtonState(planKey);
            const isCurrentPlan = planKey === currentPlan;
            const price = isAnnual ? plan.priceYearly : plan.priceMonthly;
            const period = isAnnual ? "/year" : "/month";
            const hasPlanBadge = plan.popular === true;

            return (
              <Card 
                key={planKey} 
                className={`relative flex flex-col ${isCurrentPlan ? 'border-primary ring-2 ring-primary/20' : ''} ${hasPlanBadge ? 'border-primary' : ''}`}
                data-testid={`card-plan-${planKey}`}
              >
                {hasPlanBadge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      Most Popular
                    </Badge>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="default" className="bg-green-600">
                      <Crown className="w-3 h-3 mr-1" />
                      Current
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">${price}</span>
                    <span className="text-muted-foreground">{period}</span>
                    {isAnnual && (
                      <p className="text-xs text-muted-foreground mt-1">
                        (${Math.round(plan.priceYearly / 12)}/mo billed annually)
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  {/* Plan Limits */}
                  <div className="space-y-3 pb-4 border-b">
                    <div className="flex items-center gap-2 text-sm">
                      <HardDrive className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{plan.storage}</span>
                      <span className="text-muted-foreground">storage</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileOutput className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{plan.exports}</span>
                      <span className="text-muted-foreground">exports</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{plan.guestLinks}</span>
                      <span className="text-muted-foreground">guest links</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileOutput className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{plan.exportTypes}</span>
                    </div>
                    {plan.branding !== "N/A" && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{plan.branding}</span>
                      </div>
                    )}
                    {plan.cloudSync && (
                      <div className="flex items-center gap-2 text-sm">
                        <Cloud className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Cloud sync included</span>
                      </div>
                    )}
                  </div>

                  {/* Features List */}
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        {feature.included ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className={feature.included ? "" : "text-muted-foreground"}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <div className="p-6 pt-0 mt-auto">
                  <Button
                    className="w-full"
                    variant={buttonState.variant}
                    disabled={buttonState.disabled}
                    onClick={() => handlePlanAction(planKey, buttonState.label)}
                    data-testid={`button-plan-${planKey}`}
                  >
                    {buttonState.label}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Add-ons Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add-ons
            </CardTitle>
            <CardDescription>
              Extend your plan limits as needed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!addonsData?.billingConfigured && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-300">
                    Billing Not Configured
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                    Add-ons can be selected, but checkout is unavailable until billing is configured.
                    {addonsData?.requiredEnvVars && addonsData.requiredEnvVars.length > 0 && (
                      <span className="block mt-2 font-mono text-xs">
                        Required: {addonsData.requiredEnvVars.join(", ")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {addonsData?.currentSelection.isActive && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Add-ons are active on your account.
                </p>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-3">
              {/* Guest Links Add-on */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-medium">Extra Guest Links</h4>
                </div>
                <Select
                  value={addonSelection.guestLinksMode}
                  onValueChange={(v) => setAddonSelection({
                    ...addonSelection,
                    guestLinksMode: v as typeof addonSelection.guestLinksMode,
                    guestLinksQty: v === "per_link" ? Math.max(1, addonSelection.guestLinksQty) : 0,
                  })}
                >
                  <SelectTrigger data-testid="select-guest-links-mode">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="per_link">Per Link ($5/mo each)</SelectItem>
                    <SelectItem value="unlimited">Unlimited ($49/mo)</SelectItem>
                  </SelectContent>
                </Select>
                {addonSelection.guestLinksMode === "per_link" && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="guest-links-qty" className="text-sm">Quantity:</Label>
                    <Input
                      id="guest-links-qty"
                      type="number"
                      min={1}
                      max={100}
                      value={addonSelection.guestLinksQty}
                      onChange={(e) => setAddonSelection({
                        ...addonSelection,
                        guestLinksQty: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)),
                      })}
                      className="w-20"
                      data-testid="input-guest-links-qty"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {addonSelection.guestLinksMode === "none" && "Using base plan limit"}
                  {addonSelection.guestLinksMode === "per_link" && `+${addonSelection.guestLinksQty} links = $${5 * addonSelection.guestLinksQty}/mo`}
                  {addonSelection.guestLinksMode === "unlimited" && "Unlimited links = $49/mo"}
                </p>
              </div>

              {/* Storage Add-on */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-medium">Extra Storage</h4>
                </div>
                <Select
                  value={addonSelection.storageTier}
                  onValueChange={(v) => setAddonSelection({
                    ...addonSelection,
                    storageTier: v as typeof addonSelection.storageTier,
                  })}
                >
                  <SelectTrigger data-testid="select-storage-tier">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="200gb">+200 GB ($20/mo)</SelectItem>
                    <SelectItem value="1tb">+1 TB ($50/mo)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {addonSelection.storageTier === "none" && "Using base plan storage"}
                  {addonSelection.storageTier === "200gb" && "+200 GB = $20/mo"}
                  {addonSelection.storageTier === "1tb" && "+1 TB = $50/mo"}
                </p>
              </div>

              {/* Exports Add-on */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <FileOutput className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-medium">Extra Exports</h4>
                </div>
                <Select
                  value={addonSelection.exportsTier}
                  onValueChange={(v) => setAddonSelection({
                    ...addonSelection,
                    exportsTier: v as typeof addonSelection.exportsTier,
                  })}
                >
                  <SelectTrigger data-testid="select-exports-tier">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="plus200">+200/month ($10/mo)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {addonSelection.exportsTier === "none" && "Using base plan limit"}
                  {addonSelection.exportsTier === "plus200" && "+200 exports = $10/mo"}
                </p>
              </div>
            </div>

            {/* Summary and Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Monthly add-on cost:</p>
                <p className="text-2xl font-bold">${calculateAddonCost()}/mo</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAddonSelection({
                    guestLinksMode: addonsData?.currentSelection.guestLinksMode || "none",
                    guestLinksQty: addonsData?.currentSelection.guestLinksQty || 0,
                    storageTier: addonsData?.currentSelection.storageTier || "none",
                    exportsTier: addonsData?.currentSelection.exportsTier || "none",
                  })}
                  disabled={!hasAddonChanges()}
                  data-testid="button-reset-addons"
                >
                  Reset
                </Button>
                <Button
                  onClick={() => {
                    if (addonsData?.billingConfigured) {
                      setShowAddonReview(true);
                    } else {
                      addonSelectionMutation.mutate(addonSelection);
                    }
                  }}
                  disabled={!hasAddonChanges() || addonSelectionMutation.isPending}
                  data-testid="button-save-addons"
                >
                  {addonSelectionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {addonsData?.billingConfigured ? "Review Changes" : "Save Selection"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add-on Review Modal */}
      <Dialog open={showAddonReview} onOpenChange={setShowAddonReview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Add-on Changes</DialogTitle>
            <DialogDescription>
              Confirm your add-on selection before proceeding to checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              {addonSelection.guestLinksMode !== "none" && (
                <div className="flex justify-between text-sm">
                  <span>
                    {addonSelection.guestLinksMode === "unlimited" 
                      ? "Unlimited Guest Links" 
                      : `${addonSelection.guestLinksQty} Extra Guest Links`}
                  </span>
                  <span className="font-medium">
                    ${addonSelection.guestLinksMode === "unlimited" ? 49 : 5 * addonSelection.guestLinksQty}/mo
                  </span>
                </div>
              )}
              {addonSelection.storageTier !== "none" && (
                <div className="flex justify-between text-sm">
                  <span>{addonSelection.storageTier === "200gb" ? "+200 GB Storage" : "+1 TB Storage"}</span>
                  <span className="font-medium">${addonSelection.storageTier === "200gb" ? 20 : 50}/mo</span>
                </div>
              )}
              {addonSelection.exportsTier !== "none" && (
                <div className="flex justify-between text-sm">
                  <span>+200 Exports/month</span>
                  <span className="font-medium">$10/mo</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t font-medium">
                <span>Total Monthly Add-ons</span>
                <span>${calculateAddonCost()}/mo</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddonReview(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addonSelectionMutation.mutate(addonSelection);
                setShowAddonReview(false);
              }}
              disabled={addonSelectionMutation.isPending}
              data-testid="button-confirm-addons"
            >
              {addonSelectionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save and Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Billing Integration Coming Soon Modal */}
      <Dialog open={showBillingModal} onOpenChange={setShowBillingModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAction?.action === "Upgrade" ? "Upgrade Plan" : "Change Plan"}
            </DialogTitle>
            <DialogDescription>
              {selectedAction?.action === "Upgrade" ? (
                <>
                  You're about to upgrade to the <strong className="capitalize">{selectedAction?.plan}</strong> plan.
                </>
              ) : (
                <>
                  You're about to switch to the <strong className="capitalize">{selectedAction?.plan}</strong> plan.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-center">
                <strong>Billing integration coming soon.</strong>
              </p>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Full Stripe checkout integration is being finalized. 
                For now, please contact support to change your plan.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBillingModal(false)}>
              Close
            </Button>
            <Button onClick={() => window.location.href = 'mailto:support@fieldscope.io?subject=Plan Change Request'}>
              Contact Support
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </LayoutShell>
  );
}
