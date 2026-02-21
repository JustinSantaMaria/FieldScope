import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Ruler, FileText, Cloud, Users, Shield, Check, ArrowRight } from "lucide-react";

const features = [
  {
    icon: Camera,
    title: "Real Camera Capture",
    description: "Capture photos directly with your device camera, complete with GPS coordinates and timestamps.",
  },
  {
    icon: Ruler,
    title: "Measurement Tools",
    description: "Annotate photos with dimension lines, rectangles, arrows, and text. AI helps classify measurements.",
  },
  {
    icon: FileText,
    title: "Automated Reports",
    description: "Generate professional PDF reports and CSV exports with all your survey data in one click.",
  },
  {
    icon: Cloud,
    title: "Cloud Sync",
    description: "Your data syncs automatically across devices. Work offline and sync when connected.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members, assign roles, and work together on survey projects.",
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Enterprise-grade security with encrypted storage and automatic backups.",
  },
];

const benefits = [
  "Unlimited projects and photos",
  "GPS tagging and timestamps",
  "AI-powered dimension classification",
  "PDF and CSV exports",
  "Team collaboration tools",
  "Cloud storage included",
  "Priority support",
  "Regular feature updates",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl">FieldScope</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/privacy" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Terms
            </Link>
          </nav>
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

      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <span>14-day free trial</span>
            <ArrowRight className="w-4 h-4" />
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground mb-6 max-w-4xl mx-auto leading-tight">
            Survey Photos Made Simple
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            The mobile-first app for signage and graphics survey teams. Capture, annotate, measure, and report - all in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/api/login">
              <Button size="lg" className="bg-primary text-lg px-8" data-testid="button-hero-trial">
                Start 14-Day Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </a>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8" data-testid="button-hero-pricing">
                View Pricing
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-4">No credit card required to start</p>
        </div>
      </section>

      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Everything You Need for Field Surveys
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From photo capture to final report, FieldScope streamlines your entire survey workflow.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-card border-border">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-muted-foreground">
                One plan with everything included. No hidden fees.
              </p>
            </div>
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-8 md:p-12">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl font-bold text-foreground">$25</span>
                      <span className="text-muted-foreground">/user/month</span>
                    </div>
                    <p className="text-muted-foreground mb-6">14-day free trial included</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {benefits.map((benefit) => (
                        <div key={benefit} className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="text-sm text-foreground">{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 md:min-w-[200px]">
                    <a href="/api/login">
                      <Button size="lg" className="w-full bg-primary" data-testid="button-pricing-trial">
                        Start Free Trial
                      </Button>
                    </a>
                    <p className="text-xs text-muted-foreground text-center">
                      Cancel anytime. No questions asked.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Camera className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-display font-semibold">FieldScope</span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6">
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms of Service</Link>
            </nav>
            <p className="text-sm text-muted-foreground">
              {new Date().getFullYear()} FieldScope. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
