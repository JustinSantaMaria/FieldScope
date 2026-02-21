import type { GuestLinksMode, StorageTier, ExportsTier } from "@shared/schema";

export interface AddonSelection {
  guestLinksMode: GuestLinksMode;
  guestLinksQty: number;
  storageTier: StorageTier;
  exportsTier: ExportsTier;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
}

export interface BillingProvider {
  isConfigured(): boolean;
  
  getRequiredEnvVars(): string[];
  
  createCheckoutSession(
    organizationId: number,
    selection: AddonSelection,
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionResult>;
  
  applySubscriptionUpdate(
    organizationId: number,
    subscriptionId: string,
    selection: AddonSelection
  ): Promise<void>;
  
  handleWebhook(
    payload: Buffer,
    signature: string
  ): Promise<{ organizationId: number; selection: AddonSelection } | null>;
  
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Billing is not configured. Please set up a payment provider.");
    this.name = "BillingNotConfiguredError";
  }
}

export class NoopBillingProvider implements BillingProvider {
  isConfigured(): boolean {
    return false;
  }
  
  getRequiredEnvVars(): string[] {
    return [
      "STRIPE_SECRET_KEY",
      "STRIPE_PUBLISHABLE_KEY", 
      "STRIPE_WEBHOOK_SECRET",
    ];
  }
  
  async createCheckoutSession(): Promise<CheckoutSessionResult> {
    throw new BillingNotConfiguredError();
  }
  
  async applySubscriptionUpdate(): Promise<void> {
    throw new BillingNotConfiguredError();
  }
  
  async handleWebhook(): Promise<null> {
    throw new BillingNotConfiguredError();
  }
  
  async cancelSubscription(): Promise<void> {
    throw new BillingNotConfiguredError();
  }
}

let billingProvider: BillingProvider = new NoopBillingProvider();

export function getBillingProvider(): BillingProvider {
  return billingProvider;
}

export function setBillingProvider(provider: BillingProvider): void {
  billingProvider = provider;
}

export function isBillingConfigured(): boolean {
  return billingProvider.isConfigured();
}
