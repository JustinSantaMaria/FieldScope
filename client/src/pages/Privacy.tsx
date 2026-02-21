import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Camera, ArrowLeft } from "lucide-react";

export default function Privacy() {
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
            <h1>Privacy Policy</h1>
            <p className="lead">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

            <h2>1. Information We Collect</h2>
            <p>We collect information you provide directly to us, including:</p>
            <ul>
              <li><strong>Account Information:</strong> Name, email address, and password when you create an account.</li>
              <li><strong>Project Data:</strong> Photos, annotations, measurements, and notes you upload and create.</li>
              <li><strong>Location Data:</strong> GPS coordinates when you enable location services for photo tagging.</li>
              <li><strong>Payment Information:</strong> Billing details processed securely through Stripe.</li>
              <li><strong>Usage Data:</strong> How you interact with our services to improve functionality.</li>
            </ul>

            <h2>2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze trends, usage, and activities</li>
            </ul>

            <h2>3. Information Sharing</h2>
            <p>We do not sell, trade, or rent your personal information. We may share information:</p>
            <ul>
              <li>With service providers who assist in our operations (e.g., cloud hosting, payment processing)</li>
              <li>To comply with legal obligations</li>
              <li>To protect the rights and safety of FieldScope, our users, and the public</li>
              <li>With your consent or at your direction</li>
            </ul>

            <h2>4. Data Security</h2>
            <p>We implement appropriate technical and organizational measures to protect your data:</p>
            <ul>
              <li>Encryption in transit (TLS/SSL) and at rest</li>
              <li>Regular security assessments and updates</li>
              <li>Access controls and authentication requirements</li>
              <li>Secure data centers with physical security measures</li>
            </ul>

            <h2>5. Data Retention</h2>
            <p>We retain your data for as long as your account is active or as needed to provide services. Upon account deletion:</p>
            <ul>
              <li>Personal data is deleted within 30 days</li>
              <li>Backups are purged within 90 days</li>
              <li>Aggregated, anonymized data may be retained for analytics</li>
            </ul>

            <h2>6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access and download your data</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account and associated data</li>
              <li>Object to certain processing activities</li>
              <li>Data portability (export your data)</li>
            </ul>

            <h2>7. Cookies and Tracking</h2>
            <p>We use essential cookies for authentication and session management. We do not use advertising cookies or sell tracking data to third parties.</p>

            <h2>8. Children's Privacy</h2>
            <p>FieldScope is not intended for users under 18 years of age. We do not knowingly collect information from children.</p>

            <h2>9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by email or through the application.</p>

            <h2>10. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at privacy@fieldscope.app</p>
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
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms of Service</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
