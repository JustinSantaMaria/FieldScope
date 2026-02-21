import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Camera, ArrowLeft } from "lucide-react";

export default function Terms() {
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
              <Button variant="ghost">Log In</Button>
            </a>
          </div>
        </div>
      </header>

      <main className="py-16">
        <div className="container mx-auto px-4">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
          </Link>

          <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
            <h1>Terms of Service</h1>
            <p className="lead">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using FieldScope ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.</p>

            <h2>2. Description of Service</h2>
            <p>FieldScope is a survey management application that enables users to capture, annotate, and report on field survey photos. The Service includes:</p>
            <ul>
              <li>Photo capture and storage</li>
              <li>Annotation and measurement tools</li>
              <li>Project and team management</li>
              <li>Report generation and export</li>
            </ul>

            <h2>3. Account Registration</h2>
            <p>To use the Service, you must:</p>
            <ul>
              <li>Create an account with accurate information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Be at least 18 years old or have parental consent</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>

            <h2>4. Subscription and Payment</h2>
            <h3>4.1 Free Trial</h3>
            <p>New users receive a 14-day free trial with full access to all features. No credit card is required to start the trial.</p>

            <h3>4.2 Paid Subscription</h3>
            <p>After the trial period, continued access requires a paid subscription at $25 per user per month (or $240 per user per year for annual billing).</p>

            <h3>4.3 Billing</h3>
            <ul>
              <li>Subscriptions are billed in advance on a monthly or annual basis</li>
              <li>Payment is processed through Stripe</li>
              <li>Prices are subject to change with 30 days notice</li>
            </ul>

            <h3>4.4 Cancellation</h3>
            <p>You may cancel your subscription at any time. Access continues until the end of the current billing period. No refunds are provided for partial periods.</p>

            <h2>5. User Conduct</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Upload malicious content or malware</li>
              <li>Attempt to gain unauthorized access to the Service</li>
              <li>Interfere with the operation of the Service</li>
              <li>Share account credentials with unauthorized users</li>
            </ul>

            <h2>6. Intellectual Property</h2>
            <h3>6.1 Your Content</h3>
            <p>You retain ownership of all content you upload. By using the Service, you grant us a license to store, process, and display your content as necessary to provide the Service.</p>

            <h3>6.2 Our Property</h3>
            <p>The Service, including its software, design, and documentation, is owned by FieldScope and protected by intellectual property laws.</p>

            <h2>7. Data and Privacy</h2>
            <p>Your use of the Service is also governed by our Privacy Policy, which describes how we collect, use, and protect your information.</p>

            <h2>8. Service Availability</h2>
            <p>We strive for high availability but do not guarantee uninterrupted access. The Service may be temporarily unavailable for maintenance, updates, or due to circumstances beyond our control.</p>

            <h2>9. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law:</p>
            <ul>
              <li>The Service is provided "as is" without warranties</li>
              <li>We are not liable for indirect, incidental, or consequential damages</li>
              <li>Our total liability is limited to the amount paid for the Service in the past 12 months</li>
            </ul>

            <h2>10. Indemnification</h2>
            <p>You agree to indemnify FieldScope against claims arising from your use of the Service, violation of these terms, or infringement of third-party rights.</p>

            <h2>11. Termination</h2>
            <p>We may terminate or suspend your account for violation of these terms. Upon termination:</p>
            <ul>
              <li>Your access to the Service will be revoked</li>
              <li>You may export your data within 30 days</li>
              <li>Data will be deleted according to our retention policy</li>
            </ul>

            <h2>12. Changes to Terms</h2>
            <p>We may modify these terms at any time. Material changes will be communicated via email or in-app notification. Continued use after changes constitutes acceptance.</p>

            <h2>13. Governing Law</h2>
            <p>These terms are governed by the laws of the State of Delaware, USA, without regard to conflict of law principles.</p>

            <h2>14. Contact</h2>
            <p>For questions about these Terms of Service, contact us at legal@fieldscope.app</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {new Date().getFullYear()} FieldScope. All rights reserved.
            </p>
            <nav className="flex items-center gap-6">
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
