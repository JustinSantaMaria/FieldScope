import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  Camera, 
  Check, 
  X, 
  ArrowLeft, 
  HardDrive, 
  FileOutput, 
  Link2, 
  Building2, 
  Cloud,
  Crown
} from "lucide-react";

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

const faqs = [
  {
    question: "How does the 14-day free trial work?",
    answer: "You get full access to all features of the Pro plan for 14 days, completely free. No credit card required to start. At the end of your trial, you can choose a plan that fits your needs.",
  },
  {
    question: "What are the storage caps for?",
    answer: "Storage caps apply to the total size of original photos stored in your account. Modern phone cameras capture high-resolution images (3-10 MB each), so we provide generous caps for each tier. The Starter plan (25 GB) holds roughly 2,500-8,000 photos depending on resolution.",
  },
  {
    question: "What counts as an 'export'?",
    answer: "Each time you generate a ZIP, PDF, Excel, or Full Export package counts as one export. Downloading the same export multiple times doesn't count as additional exports. Monthly export limits reset at the start of each calendar month.",
  },
  {
    question: "What are Guest Survey Links?",
    answer: "Guest Survey Links let you share a project with vendors, customers, or subcontractors so they can add photos and annotations directly. They only have access to that specific project - not your other projects or account settings.",
  },
  {
    question: "What's the difference between FieldScope and Custom branding?",
    answer: "Pro plan PDF exports include the FieldScope logo and branding. Business plan users can upload their own company logo and details which replace FieldScope branding in exports, giving you professional white-label reports for your clients.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your current billing period. No cancellation fees, no questions asked.",
  },
  {
    question: "What happens to my data if I cancel?",
    answer: "Your data remains accessible in read-only mode for 30 days after cancellation. You can export all your data during this period. After 30 days, data is securely deleted.",
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. All data is encrypted in transit and at rest. We use enterprise-grade cloud infrastructure with automatic backups and strict access controls.",
  },
];

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl">FieldScope</span>
          </Link>
          <div className="flex items-center gap-3">
            <a href="/api/login">
              <Button variant="ghost" data-testid="button-login">Log In</Button>
            </a>
            <a href="/api/login">
              <Button className="bg-primary" data-testid="button-signup">Start Free Trial</Button>
            </a>
          </div>
        </div>
      </header>

      <main className="py-16">
        <div className="container mx-auto px-4">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
          </Link>

          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Simple, Transparent Pricing
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Choose the plan that fits your survey volume. Start with a 14-day free trial.
              </p>

              {/* Billing Toggle */}
              <div className="flex items-center justify-center gap-4">
                <Label htmlFor="pricing-toggle" className={!isAnnual ? "font-semibold" : "text-muted-foreground"}>
                  Monthly
                </Label>
                <Switch
                  id="pricing-toggle"
                  checked={isAnnual}
                  onCheckedChange={setIsAnnual}
                  data-testid="switch-billing-period"
                />
                <Label htmlFor="pricing-toggle" className={isAnnual ? "font-semibold" : "text-muted-foreground"}>
                  Annual
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Save ~17%
                  </Badge>
                </Label>
              </div>
            </div>

            {/* Plan Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              {Object.entries(PLAN_FEATURES).map(([planKey, plan]) => {
                const price = isAnnual ? plan.priceYearly : plan.priceMonthly;
                const period = isAnnual ? "/year" : "/month";
                const hasPlanBadge = plan.popular === true;

                return (
                  <Card 
                    key={planKey} 
                    className={`relative flex flex-col ${hasPlanBadge ? 'border-primary border-2' : ''}`}
                    data-testid={`card-plan-${planKey}`}
                  >
                    {hasPlanBadge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="pb-4">
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <CardDescription>{plan.description}</CardDescription>
                      <div className="pt-2">
                        <span className="text-4xl font-bold">${price}</span>
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
                      <a href="/api/login">
                        <Button
                          className="w-full"
                          variant={hasPlanBadge ? "default" : "outline"}
                          data-testid={`button-plan-${planKey}`}
                        >
                          Start 14-Day Free Trial
                        </Button>
                      </a>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Add-ons Section */}
            <Card className="mb-16">
              <CardHeader>
                <CardTitle>Add-ons</CardTitle>
                <CardDescription>
                  Extend your plan limits as needed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium">Extra Guest Links</h4>
                    <p className="text-sm text-muted-foreground mt-1">$5/link/month or $49/mo unlimited</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium">Extra Storage</h4>
                    <p className="text-sm text-muted-foreground mt-1">+200 GB for $20/mo or +1 TB for $50/mo</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium">Extra Exports</h4>
                    <p className="text-sm text-muted-foreground mt-1">+200 exports for $10/mo</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* How it Works Section */}
            <Card className="mb-16 bg-muted/30">
              <CardHeader>
                <CardTitle>How Guest Survey Links Work</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Share a project with vendors, customers, or subcontractors so they can contribute photos and annotations directly:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Create a Guest Survey Link for your project</li>
                  <li>Send the link to your vendor/customer</li>
                  <li>They add photos and dimensions to the project</li>
                  <li>Export a clean, professional survey package with all contributions</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-4">
                  Caps are guardrails for storage-heavy originals from phones. Most users never hit them.
                </p>
              </CardContent>
            </Card>

            {/* FAQs */}
            <div className="mb-16">
              <h2 className="text-2xl font-display font-bold text-foreground mb-6 text-center">
                Frequently Asked Questions
              </h2>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left" data-testid={`faq-trigger-${index}`}>
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Bottom CTA */}
            <div className="text-center bg-muted/30 rounded-2xl p-8">
              <h3 className="text-2xl font-display font-bold text-foreground mb-2">
                Ready to get started?
              </h3>
              <p className="text-muted-foreground mb-6">
                Start your 14-day free trial today. No credit card required.
              </p>
              <a href="/api/login">
                <Button size="lg" className="bg-primary" data-testid="button-bottom-cta">
                  Start Free Trial
                </Button>
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {new Date().getFullYear()} FieldScope. All rights reserved.
            </p>
            <nav className="flex items-center gap-6">
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
