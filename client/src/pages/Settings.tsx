import { LayoutShell } from "@/components/layout-shell";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HardDrive, Cloud, LogOut, Building2, Phone, Mail, Globe, MapPin, Upload, Lock, Crown, Sparkles, X, ArrowRight, Smartphone, Type } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { getSaveToLibraryPreference, setSaveToLibraryPreference, isNativeApp } from "@/lib/photoLibrarySave";

interface OrgBranding {
  businessName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  colorAccent1: string | null;
  colorAccent2: string | null;
  colorNeutral: string | null;
  reportFont: string | null;
}

const PDF_FONTS = [
  { value: "Helvetica", label: "Helvetica", description: "Modern, clean" },
  { value: "Open Sans", label: "Open Sans", description: "Friendly, readable" },
  { value: "Roboto", label: "Roboto", description: "Contemporary, balanced" },
  { value: "Lato", label: "Lato", description: "Warm, professional" },
  { value: "Montserrat", label: "Montserrat", description: "Bold, geometric" },
  { value: "Times-Roman", label: "Times Roman", description: "Classic, traditional" },
  { value: "Playfair Display", label: "Playfair Display", description: "Elegant, editorial" },
  { value: "Source Serif", label: "Source Serif", description: "Refined, scholarly" },
  { value: "Courier", label: "Courier", description: "Monospace, technical" },
] as const;

interface BrandingResponse {
  branding: OrgBranding;
  plan: string;
  isAdmin: boolean;
  isPremium: boolean;
}

function BrandingSection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data, isLoading, error } = useQuery<BrandingResponse>({
    queryKey: ["/api/org/branding"],
  });
  
  const [formData, setFormData] = useState<OrgBranding>({
    businessName: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    logoUrl: null,
    colorPrimary: "#1e40af",
    colorSecondary: "#64748b",
    colorAccent1: "#0ea5e9",
    colorAccent2: "#f59e0b",
    colorNeutral: "#6b7280",
    reportFont: "Helvetica",
  });
  
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  
  const updateMutation = useMutation({
    mutationFn: async (data: OrgBranding) => {
      return apiRequest("PUT", "/api/org/branding", data);
    },
    onSuccess: () => {
      toast({ title: "Branding saved", description: "Your company branding has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/org/branding"] });
      setIsFormDirty(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save branding", variant: "destructive" });
    },
  });
  
  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const response = await fetch("/api/org/branding/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setFormData(prev => ({ ...prev, logoUrl: data.logoUrl }));
      setLogoPreview(null);
      toast({ title: "Logo uploaded", description: "Your company logo has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/org/branding"] });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center text-muted-foreground">Loading branding settings...</div>
        </CardContent>
      </Card>
    );
  }
  
  if (error || !data) {
    return null;
  }
  
  if (!data.isAdmin) {
    return null;
  }
  
  const isPremium = data.isPremium;
  const currentBranding = data.branding;
  
  if (!isFormDirty && currentBranding) {
    if (formData.businessName !== (currentBranding.businessName || "")) {
      setFormData({
        businessName: currentBranding.businessName || "",
        phone: currentBranding.phone || "",
        email: currentBranding.email || "",
        website: currentBranding.website || "",
        address: currentBranding.address || "",
        logoUrl: currentBranding.logoUrl,
        colorPrimary: currentBranding.colorPrimary || "#1e40af",
        colorSecondary: currentBranding.colorSecondary || "#64748b",
        colorAccent1: currentBranding.colorAccent1 || "#0ea5e9",
        colorAccent2: currentBranding.colorAccent2 || "#f59e0b",
        colorNeutral: currentBranding.colorNeutral || "#6b7280",
        reportFont: currentBranding.reportFont || "Helvetica",
      });
    }
  }
  
  const handleInputChange = (field: keyof OrgBranding, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsFormDirty(true);
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 5MB", variant: "destructive" });
      return;
    }
    
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast({ title: "Invalid file type", description: "Logo must be PNG, JPG, or WebP", variant: "destructive" });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    
    logoUploadMutation.mutate(file);
  };
  
  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logoUrl: null }));
    setLogoPreview(null);
    setIsFormDirty(true);
  };
  
  const handleSave = () => {
    updateMutation.mutate(formData);
  };
  
  if (!isPremium) {
    return (
      <Card className="border-2 border-dashed border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <CardTitle>Premium Feature: White-Label PDF Reports</CardTitle>
          </div>
          <CardDescription>
            Upgrade to Premium to add your logo and company details to PDF headers/footers and remove the "Generated by FieldScope" branding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Add your company logo to every PDF</span>
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Show your business name, phone, and email in headers/footers</span>
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Remove FieldScope branding (white-label exports)</span>
            </li>
          </ul>
          
          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground mb-1">Current PDF footer preview (Free/Pro):</p>
            <p className="text-sm font-medium">Generated by FieldScope — fieldscopeapp.com</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 items-start">
          <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white" data-testid="button-upgrade-premium">
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to Premium
          </Button>
          <p className="text-xs text-muted-foreground">On Free/Pro plans, exported PDFs include FieldScope branding.</p>
        </CardFooter>
      </Card>
    );
  }
  
  const displayLogoUrl = logoPreview || formData.logoUrl;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <CardTitle>Company Branding (PDF Reports)</CardTitle>
          <Badge variant="secondary" className="ml-auto bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
            <Crown className="w-3 h-3 mr-1" />
            Premium
          </Badge>
        </div>
        <CardDescription>Used in PDF report headers/footers for client-facing exports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="businessName"
                placeholder="Your Company Name"
                value={formData.businessName || ""}
                onChange={(e) => handleInputChange("businessName", e.target.value)}
                className="pl-10"
                data-testid="input-business-name"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  placeholder="(555) 123-4567"
                  value={formData.phone || ""}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="pl-10"
                  data-testid="input-phone"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="contact@company.com"
                  value={formData.email || ""}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="pl-10"
                  data-testid="input-email"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="website">Website (optional)</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="website"
                placeholder="https://www.yourcompany.com"
                value={formData.website || ""}
                onChange={(e) => handleInputChange("website", e.target.value)}
                className="pl-10"
                data-testid="input-website"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">Address (optional)</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Textarea
                id="address"
                placeholder="123 Main St, City, State 12345"
                value={formData.address || ""}
                onChange={(e) => handleInputChange("address", e.target.value)}
                className="pl-10 min-h-[60px]"
                data-testid="input-address"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Company Logo</Label>
            <div className="flex items-start gap-4">
              {displayLogoUrl ? (
                <div className="relative">
                  <div className="w-24 h-24 border border-border rounded-lg overflow-hidden bg-white flex items-center justify-center">
                    <img src={displayLogoUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 w-6 h-6"
                    onClick={handleRemoveLogo}
                    data-testid="button-remove-logo"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div
                  className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:border-primary hover:text-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-6 h-6 mb-1" />
                  <span className="text-xs">Upload</span>
                </div>
              )}
              <div className="flex-1 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-logo-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploadMutation.isPending}
                  data-testid="button-upload-logo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {logoUploadMutation.isPending ? "Uploading..." : displayLogoUrl ? "Replace Logo" : "Upload Logo"}
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG, or WebP. Max 5MB.</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-base font-medium">Theme Colors</Label>
            <p className="text-xs text-muted-foreground">These colors are used for headers, section titles, and accents in your PDF reports.</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="colorPrimary" className="text-xs">Primary</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="colorPrimary"
                    value={formData.colorPrimary || "#1e40af"}
                    onChange={(e) => handleInputChange("colorPrimary", e.target.value)}
                    className="w-10 h-10 rounded-md border border-border cursor-pointer"
                    data-testid="input-color-primary"
                  />
                  <Input
                    value={formData.colorPrimary || "#1e40af"}
                    onChange={(e) => handleInputChange("colorPrimary", e.target.value)}
                    className="flex-1 font-mono text-xs uppercase"
                    maxLength={7}
                    data-testid="input-color-primary-hex"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="colorSecondary" className="text-xs">Secondary</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="colorSecondary"
                    value={formData.colorSecondary || "#64748b"}
                    onChange={(e) => handleInputChange("colorSecondary", e.target.value)}
                    className="w-10 h-10 rounded-md border border-border cursor-pointer"
                    data-testid="input-color-secondary"
                  />
                  <Input
                    value={formData.colorSecondary || "#64748b"}
                    onChange={(e) => handleInputChange("colorSecondary", e.target.value)}
                    className="flex-1 font-mono text-xs uppercase"
                    maxLength={7}
                    data-testid="input-color-secondary-hex"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="colorAccent1" className="text-xs">Accent 1</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="colorAccent1"
                    value={formData.colorAccent1 || "#0ea5e9"}
                    onChange={(e) => handleInputChange("colorAccent1", e.target.value)}
                    className="w-10 h-10 rounded-md border border-border cursor-pointer"
                    data-testid="input-color-accent1"
                  />
                  <Input
                    value={formData.colorAccent1 || "#0ea5e9"}
                    onChange={(e) => handleInputChange("colorAccent1", e.target.value)}
                    className="flex-1 font-mono text-xs uppercase"
                    maxLength={7}
                    data-testid="input-color-accent1-hex"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="colorAccent2" className="text-xs">Accent 2</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="colorAccent2"
                    value={formData.colorAccent2 || "#f59e0b"}
                    onChange={(e) => handleInputChange("colorAccent2", e.target.value)}
                    className="w-10 h-10 rounded-md border border-border cursor-pointer"
                    data-testid="input-color-accent2"
                  />
                  <Input
                    value={formData.colorAccent2 || "#f59e0b"}
                    onChange={(e) => handleInputChange("colorAccent2", e.target.value)}
                    className="flex-1 font-mono text-xs uppercase"
                    maxLength={7}
                    data-testid="input-color-accent2-hex"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="colorNeutral" className="text-xs">Neutral</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="colorNeutral"
                    value={formData.colorNeutral || "#6b7280"}
                    onChange={(e) => handleInputChange("colorNeutral", e.target.value)}
                    className="w-10 h-10 rounded-md border border-border cursor-pointer"
                    data-testid="input-color-neutral"
                  />
                  <Input
                    value={formData.colorNeutral || "#6b7280"}
                    onChange={(e) => handleInputChange("colorNeutral", e.target.value)}
                    className="flex-1 font-mono text-xs uppercase"
                    maxLength={7}
                    data-testid="input-color-neutral-hex"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-base font-medium">Report Font</Label>
            <p className="text-xs text-muted-foreground">Choose the font used throughout your PDF reports.</p>
            <div className="flex items-center gap-3">
              <Type className="w-5 h-5 text-muted-foreground" />
              <Select
                value={formData.reportFont || "Helvetica"}
                onValueChange={(value) => handleInputChange("reportFont", value)}
              >
                <SelectTrigger className="w-[200px]" data-testid="select-report-font">
                  <SelectValue placeholder="Select font" />
                </SelectTrigger>
                <SelectContent>
                  {PDF_FONTS.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      <span className="flex items-center gap-2">
                        <span>{font.label}</span>
                        <span className="text-xs text-muted-foreground">({font.description})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between gap-2 border-t pt-4">
        <p className="text-xs text-muted-foreground">Your branding will appear on all exported PDFs.</p>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || !isFormDirty}
          data-testid="button-save-branding"
        >
          {updateMutation.isPending ? "Saving..." : "Save Branding"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function PhotoLibraryPreference() {
  const [enabled, setEnabled] = useState(getSaveToLibraryPreference());
  const isNative = isNativeApp();
  
  const handleChange = (checked: boolean) => {
    setEnabled(checked);
    setSaveToLibraryPreference(checked);
  };
  
  // On web browsers, show disabled state with "mobile app only" message
  if (!isNative) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="text-base text-muted-foreground">Auto-save to Photos</Label>
            <Badge variant="secondary" className="text-xs">
              <Smartphone className="w-3 h-3 mr-1" />
              Mobile App Only
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Available in the FieldScope mobile app only.
          </p>
        </div>
        <Switch 
          checked={false} 
          disabled={true}
          data-testid="switch-save-to-library" 
        />
      </div>
    );
  }
  
  // Native app: show the toggle
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-base">Auto-save to Photos</Label>
        <p className="text-sm text-muted-foreground">
          Automatically save captured photos to your camera roll
        </p>
      </div>
      <Switch 
        checked={enabled} 
        onCheckedChange={handleChange}
        data-testid="switch-save-to-library" 
      />
    </div>
  );
}

export default function Settings() {
  return (
    <LayoutShell title="Settings">
      <div className="max-w-2xl mx-auto space-y-6">
        <BrandingSection />
        
        <Card>
          <CardHeader>
            <CardTitle>Cloud Storage</CardTitle>
            <CardDescription>Connect your cloud provider for automatic export syncing</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings/integrations">
              <Button variant="outline" className="w-full justify-between" data-testid="link-integrations">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  <span>Manage Cloud Integrations</span>
                </div>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-2">
              Connect Google Drive, OneDrive, or Dropbox to automatically sync your exports.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <PhotoLibraryPreference />
            
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label className="text-base">Offline Sync</Label>
                <p className="text-sm text-muted-foreground">Download projects for offline use</p>
              </div>
              <Switch checked={true} onCheckedChange={() => {}} data-testid="switch-offline-sync" />
            </div>
          </CardContent>
        </Card>
        
        <div className="flex justify-center pt-6">
          <Button 
            variant="destructive" 
            className="w-full sm:w-auto" 
            data-testid="button-sign-out"
            onClick={() => window.location.href = '/api/logout'}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </LayoutShell>
  );
}
