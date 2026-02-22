# Checkout.com Integration Plan for Autumn

> **Author:** Engineering Planning Agent  
> **Date:** 2026-02-22  
> **Status:** Draft — for review by engineering team  
> **Prerequisite reading:** `checkout-com-research.md`, `stripe-actions-analysis.md`, `stripe-webhooks-analysis.md`, `billing-core-analysis.md`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Provider Abstraction Layer](#2-provider-abstraction-layer)
3. [Checkout.com Provider Implementation](#3-checkoutcom-provider-implementation)
4. [Database Changes](#4-database-changes)
5. [Subscription Scheduler](#5-subscription-scheduler)
6. [Migration Path](#6-migration-path)
7. [File-by-file Implementation Tasks](#7-file-by-file-implementation-tasks)
8. [Risks and Open Questions](#8-risks-and-open-questions)
9. [Phase Plan](#9-phase-plan)

---

## 1. Architecture Overview

### Current State

The billing v2 pipeline is:

```
Request → Setup Context → Compute AutumnBillingPlan → evaluateStripeBillingPlan → executeBillingPlan
```

- **AutumnBillingPlan** is provider-agnostic (DB mutations: insert/update/delete customer products, line items, entitlements)
- **StripeBillingPlan** is Stripe-specific (subscription create/update/cancel, checkout sessions, invoices, schedules)
- **BillingContext** is contaminated — it embeds `stripeCustomer`, `stripeSubscription`, `stripeDiscounts`, `paymentMethod` (Stripe types) directly

### Target State

```
Request → Setup Context → Compute AutumnBillingPlan → provider.evaluate() → provider.execute()
                              │                            │
                              │                     ┌──────┴──────┐
                              │                     │             │
                              │              StripeProvider  CheckoutComProvider
                              │                     │             │
                              │              StripeBillingPlan  CheckoutComBillingPlan
                              │                     │             │
                              ▼                     ▼             ▼
                     executeAutumnBillingPlan   Stripe APIs   CKO APIs + Scheduler
```

**Key architectural difference:** Stripe manages subscription lifecycle natively. Checkout.com is a payment rail only — Autumn must own the entire subscription state machine (scheduling, renewal, proration, dunning, trials, cancellation).

This means Checkout.com integration requires a **Subscription Scheduler** — a new internal service that replaces what Stripe Billing does automatically.

### Where Checkout.com Fits

| Billing Concept | Stripe | Checkout.com |
|---|---|---|
| One-time payment | Checkout Session (payment mode) / Invoice | Hosted Payments Page / direct `POST /payments` |
| Recurring setup | `subscriptions.create` | Store card via Vault, create internal subscription record |
| Recurring charge | Stripe auto-charges on cycle | Scheduler triggers `POST /payments` with stored instrument |
| Plan change | `subscriptions.update` + proration | Autumn computes proration, charges/credits via `POST /payments` |
| Cancellation | `subscriptions.cancel` | Autumn marks internal sub as canceled, stops scheduling |
| Trial | `subscription_data.trial_end` | Autumn delays first charge until trial ends |
| Dunning/retry | Stripe Smart Retries | Checkout.com `retry.dunning` on payment request, or Autumn-managed |
| Webhooks | 10 event types | ~7 `payment_*` events |

---

## 2. Provider Abstraction Layer

### 2.1 Provider Interface

```typescript
// shared/providers/billingProvider.ts

import { AutumnContext } from "@/shared/models/context";
import { AutumnBillingPlan } from "@/shared/models/billingModels/plan/autumnBillingPlan";

/**
 * Result of executing a provider-specific billing plan.
 * `deferred` means execution paused waiting for async confirmation
 * (3DS, hosted payment page, pending bank transfer, etc.)
 */
export interface ProviderBillingPlanResult {
  deferred: boolean;
  requiredAction?: {
    type: "redirect" | "confirm";
    url?: string;        // redirect URL for hosted pages
    clientSecret?: string; // for client-side confirmation
  };
}

/**
 * Generic billing provider interface.
 * TPlan = the provider-specific billing plan type
 * TContext = the provider-specific context type
 */
export interface BillingProvider<
  TPlan,
  TContext extends ProviderBillingContext,
> {
  readonly type: ProcessorType;

  /**
   * Setup: fetch provider-specific resources needed for billing.
   * Called during setupAttachBillingContext / setupUpdateSubscriptionBillingContext.
   */
  setupContext(
    ctx: AutumnContext,
    customerId: string,
    options: ProviderSetupOptions,
  ): Promise<TContext>;

  /**
   * Evaluate: translate AutumnBillingPlan → provider-specific plan.
   */
  evaluate(
    ctx: AutumnContext,
    billingContext: BillingContext,
    autumnPlan: AutumnBillingPlan,
  ): Promise<TPlan>;

  /**
   * Execute: carry out the provider-specific plan (API calls).
   */
  execute(
    ctx: AutumnContext,
    billingPlan: { autumn: AutumnBillingPlan; provider: TPlan },
    billingContext: BillingContext,
  ): Promise<ProviderBillingPlanResult>;

  /**
   * Init resources: ensure provider-side products/prices exist.
   */
  initResources(
    ctx: AutumnContext,
    autumnPlan: AutumnBillingPlan,
  ): Promise<void>;

  /**
   * Create or retrieve the provider customer for an Autumn customer.
   */
  ensureCustomer(
    ctx: AutumnContext,
    customer: FullCustomer,
  ): Promise<string>; // returns provider customer ID

  /**
   * Apply discounts to line items (provider-specific discount logic).
   */
  applyDiscounts?(
    lineItems: LineItem[],
    context: TContext,
  ): LineItem[];
}

/**
 * Base type for provider-specific context fields.
 */
export interface ProviderBillingContext {
  type: ProcessorType;
}
```

### 2.2 Refactored BillingContext

```typescript
// shared/models/billingModels/context/billingContext.ts

export interface BillingContext {
  // === Provider-agnostic (unchanged) ===
  fullCustomer: FullCustomer;
  fullProducts: FullProduct[];
  featureQuantities: FeatureOptions[];
  adjustableFeatureQuantities?: string[];
  transitionConfig?: TransitionConfig;
  invoiceMode?: InvoiceMode;
  currentEpochMs: number;
  billingCycleAnchorMs: number | "now";
  resetCycleAnchorMs: number | "now";
  customPrices?: Price[];
  customEnts?: Entitlement[];
  trialContext?: TrialContext;
  isCustom?: boolean;
  cancelAction?: CancelAction;
  billingVersion: BillingVersion;
  successUrl?: string;

  // === Provider context (REPLACES direct Stripe fields) ===
  providerContext: StripeBillingContext | CheckoutComBillingContext;
}

export interface StripeBillingContext extends ProviderBillingContext {
  type: ProcessorType.Stripe;
  stripeCustomer: Stripe.Customer;
  stripeSubscription?: Stripe.Subscription;
  stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
  stripeDiscounts?: StripeDiscountWithCoupon[];
  paymentMethod?: Stripe.PaymentMethod;
}

export interface CheckoutComBillingContext extends ProviderBillingContext {
  type: ProcessorType.CheckoutCom;
  ckoCustomerId: string;
  ckoInstrument?: CkoInstrument;        // stored payment instrument
  autumnSubscription?: AutumnSubscription; // internal sub record (not from CKO)
  autumnSchedule?: AutumnSchedule;        // internal schedule record
}
```

### 2.3 Refactored BillingPlan

```typescript
// shared/models/billingModels/plan/billingPlan.ts

export type BillingPlan = {
  autumn: AutumnBillingPlan;
  provider: StripeBillingPlan | CheckoutComBillingPlan;
};
```

### 2.4 Provider Registry

```typescript
// shared/providers/providerRegistry.ts

import { StripeBillingProvider } from "@/providers/stripe/stripeBillingProvider";
import { CheckoutComBillingProvider } from "@/providers/checkoutCom/checkoutComBillingProvider";

const providers: Record<ProcessorType, BillingProvider<any, any>> = {
  [ProcessorType.Stripe]: new StripeBillingProvider(),
  [ProcessorType.CheckoutCom]: new CheckoutComBillingProvider(),
};

export function getProvider(type: ProcessorType): BillingProvider<any, any> {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown processor type: ${type}`);
  return provider;
}

export function getOrgProvider(org: Org): BillingProvider<any, any> {
  const processorType = org.processor_type ?? ProcessorType.Stripe;
  return getProvider(processorType);
}
```

### 2.5 ProcessorType Enum Update

```typescript
// shared/models/enums/processorType.ts

export enum ProcessorType {
  Stripe = "stripe",
  RevenueCat = "revenuecat",
  CheckoutCom = "checkout_com",  // NEW
}
```

### 2.6 Provider Reference Abstraction

Currently `FullCusProduct.subscription_ids` and `scheduled_ids` store Stripe subscription/schedule IDs directly. This needs abstraction:

```typescript
// shared/models/cusProduct.ts — updated fields

interface CusProduct {
  // ... existing fields ...

  // DEPRECATE (keep for backward compat with Stripe):
  subscription_ids?: string[];
  scheduled_ids?: string[];

  // NEW: provider-agnostic references
  provider_refs?: {
    provider: ProcessorType;
    subscription_id?: string;  // Stripe sub ID or Autumn internal sub ID
    schedule_id?: string;      // Stripe schedule ID or Autumn internal schedule ID
    instrument_id?: string;    // CKO src_* ID
  };
}
```

---

## 3. Checkout.com Provider Implementation

### 3.1 Customer Management

Checkout.com customers (`cus_*`) are lightweight — just email, name, phone. Created explicitly or implicitly during first payment.

```typescript
// providers/checkoutCom/customers.ts

export async function ensureCkoCustomer(
  ctx: AutumnContext,
  customer: FullCustomer,
): Promise<string> {
  // Check if customer already has a CKO customer ID
  const existingCkoId = customer.processor_ids?.checkout_com;
  if (existingCkoId) return existingCkoId;

  // Create in CKO
  const ckoCustomer = await ckoClient.post("/customers", {
    email: customer.email,
    name: customer.name,
    metadata: { autumn_customer_id: customer.id },
  });

  // Store mapping in Autumn
  await CustomerService.updateProcessorId(ctx, customer.id, {
    checkout_com: ckoCustomer.id,
  });

  return ckoCustomer.id;
}
```

**DB mapping:** Add `checkout_com` to the `processor_ids` JSONB column on the `customers` table (already supports multiple processor IDs via the existing pattern used for Stripe/RevenueCat).

### 3.2 Payment Instrument Storage

When a customer first pays, store their card for future use:

```typescript
// providers/checkoutCom/instruments.ts

export interface CkoInstrument {
  id: string;          // src_* — the reusable instrument ID
  type: string;        // "card", "bank_account", etc.
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  fingerprint?: string;
  customer_id: string; // cus_*
}

/**
 * After a successful payment with store_for_future_use, the payment response
 * contains source.id (src_*). We persist that to our DB.
 */
export async function storeInstrumentFromPayment(
  ctx: AutumnContext,
  customerId: string,
  paymentResponse: CkoPaymentResponse,
): Promise<CkoInstrument> {
  const instrument: CkoInstrument = {
    id: paymentResponse.source.id,
    type: paymentResponse.source.type,
    last4: paymentResponse.source.last4,
    expiry_month: paymentResponse.source.expiry_month,
    expiry_year: paymentResponse.source.expiry_year,
    fingerprint: paymentResponse.source.fingerprint,
    customer_id: paymentResponse.customer.id,
  };

  await db.cko_instruments.upsert({
    where: { id: instrument.id },
    create: instrument,
    update: instrument,
  });

  return instrument;
}
```

### 3.3 One-Time Payments

Two paths, mirroring Stripe's checkout session vs direct charge:

#### Path A: Hosted Payments Page (≈ Stripe Checkout)

For customers without a stored payment method, redirect to Checkout.com's hosted page:

```typescript
// providers/checkoutCom/actions/hostedPaymentAction.ts

export interface CkoHostedPaymentAction {
  type: "create_hosted_payment";
  params: {
    amount: number;
    currency: string;
    reference: string;
    billing: { address?: object };
    customer: { email: string; name?: string };
    success_url: string;
    failure_url: string;
    capture: boolean;
    metadata: Record<string, string>;
    "3ds": { enabled: boolean };
    processing_channel_id: string;
    items?: Array<{ name: string; quantity: number; unit_price: number }>;
  };
}

export function buildCkoHostedPaymentAction(
  billingContext: BillingContext,
  autumnPlan: AutumnBillingPlan,
): CkoHostedPaymentAction | undefined {
  const ckoCtx = billingContext.providerContext as CheckoutComBillingContext;

  // Only use hosted page when no stored instrument
  if (ckoCtx.ckoInstrument) return undefined;

  const lineItems = autumnPlan.lineItems?.filter((li) => li.chargeImmediately);
  if (!lineItems?.length) return undefined;

  const totalAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);

  return {
    type: "create_hosted_payment",
    params: {
      amount: totalAmount,
      currency: lineItems[0].currency.toUpperCase(),
      reference: `autumn_${autumnPlan.insertCustomerProducts?.[0]?.id ?? "charge"}_${Date.now()}`,
      customer: {
        email: billingContext.fullCustomer.email,
        name: billingContext.fullCustomer.name,
      },
      success_url: billingContext.successUrl ?? "",
      failure_url: billingContext.successUrl ?? "",
      capture: true,
      "3ds": { enabled: true },
      processing_channel_id: getProcessingChannelId(billingContext),
      metadata: {
        autumn_customer_id: billingContext.fullCustomer.id,
        autumn_billing_plan: "deferred", // signals webhook to resume
      },
      items: lineItems.map((li) => ({
        name: li.description,
        quantity: 1,
        unit_price: li.amount,
      })),
    },
  };
}
```

#### Path B: Direct Charge (stored instrument)

For returning customers with a stored card:

```typescript
// providers/checkoutCom/actions/directPaymentAction.ts

export interface CkoDirectPaymentAction {
  type: "create_payment";
  params: {
    source: { type: "id"; id: string; stored: true };
    amount: number;
    currency: string;
    reference: string;
    capture: boolean;
    customer: { id: string };
    merchant_initiated: boolean;
    payment_type: "Regular" | "Recurring";
    processing_channel_id: string;
    metadata: Record<string, string>;
    retry?: { dunning?: { enabled: boolean; max_attempts: number; end_after_days: number } };
  };
}

export function buildCkoDirectPaymentAction(
  billingContext: BillingContext,
  autumnPlan: AutumnBillingPlan,
  options: { merchantInitiated: boolean; paymentType: "Regular" | "Recurring" },
): CkoDirectPaymentAction | undefined {
  const ckoCtx = billingContext.providerContext as CheckoutComBillingContext;

  if (!ckoCtx.ckoInstrument) return undefined;

  const lineItems = autumnPlan.lineItems?.filter((li) => li.chargeImmediately);
  if (!lineItems?.length) return undefined;

  const totalAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);

  return {
    type: "create_payment",
    params: {
      source: { type: "id", id: ckoCtx.ckoInstrument.id, stored: true },
      amount: totalAmount,
      currency: lineItems[0].currency.toUpperCase(),
      reference: `autumn_recurring_${Date.now()}`,
      capture: true,
      customer: { id: ckoCtx.ckoCustomerId },
      merchant_initiated: options.merchantInitiated,
      payment_type: options.paymentType,
      processing_channel_id: getProcessingChannelId(billingContext),
      metadata: {
        autumn_customer_id: billingContext.fullCustomer.id,
        autumn_subscription_id: ckoCtx.autumnSubscription?.id ?? "",
      },
      retry: {
        dunning: { enabled: true, max_attempts: 6, end_after_days: 30 },
      },
    },
  };
}
```

### 3.4 Recurring Payments (Subscription Lifecycle)

Since Checkout.com has no subscription engine, Autumn must own the entire lifecycle. This is the most complex part of the integration.

#### Internal Subscription Model

```typescript
// shared/models/autumnSubscription.ts

export interface AutumnSubscription {
  id: string;                        // autumn_sub_*
  customer_id: string;
  org_id: string;
  env: string;
  provider: ProcessorType;

  // Billing state
  status: AutumnSubStatus;
  current_period_start: number;      // epoch ms
  current_period_end: number;        // epoch ms
  billing_cycle_anchor: number;      // epoch ms
  interval: "month" | "year" | "week" | "day";
  interval_count: number;

  // Payment
  instrument_id?: string;            // CKO src_* or null
  currency: string;
  amount: number;                    // current recurring amount in minor units

  // Trial
  trial_end?: number;                // epoch ms, null if no trial

  // Cancellation
  cancel_at?: number;                // epoch ms — scheduled cancellation
  canceled_at?: number;              // epoch ms — when cancel was requested
  cancel_at_period_end: boolean;

  // Dunning
  dunning_attempts: number;
  last_dunning_at?: number;
  next_payment_at: number;           // epoch ms — when scheduler should charge

  // Linkage
  customer_product_ids: string[];    // Autumn customer_product IDs on this sub
  cko_customer_id: string;

  // Metadata
  metadata?: Record<string, string>;
  created_at: number;
  updated_at: number;
}

export enum AutumnSubStatus {
  Active = "active",
  Trialing = "trialing",
  PastDue = "past_due",
  Canceled = "canceled",
  Expired = "expired",
  Incomplete = "incomplete",  // waiting for first payment
}
```

#### Recurring Action Builder

```typescript
// providers/checkoutCom/actions/recurringAction.ts

export type CkoRecurringAction =
  | { type: "create_subscription"; subscription: Omit<AutumnSubscription, "id"> }
  | { type: "update_subscription"; subscriptionId: string; updates: Partial<AutumnSubscription> }
  | { type: "cancel_subscription"; subscriptionId: string; cancelAt?: number; immediate: boolean };

export function buildCkoRecurringAction(
  billingContext: BillingContext,
  autumnPlan: AutumnBillingPlan,
): CkoRecurringAction | undefined {
  const ckoCtx = billingContext.providerContext as CheckoutComBillingContext;
  const existingSub = ckoCtx.autumnSubscription;

  // Determine recurring items from the plan
  const recurringProducts = autumnPlan.insertCustomerProducts?.filter(
    (cp) => cp.product?.prices?.some((p) => p.type === "recurring")
  );

  const hasRecurringItems = recurringProducts && recurringProducts.length > 0;
  const isCancel = autumnPlan.updateCustomerProduct?.updates?.status === "canceled"
    || autumnPlan.updateCustomerProduct?.updates?.canceled;

  // Case 1: No existing sub + new recurring items → create
  if (!existingSub && hasRecurringItems) {
    const recurringPrice = recurringProducts[0].product.prices.find(
      (p: any) => p.type === "recurring"
    );
    const now = billingContext.currentEpochMs;
    const trialEnd = billingContext.trialContext?.trialEnd;

    return {
      type: "create_subscription",
      subscription: {
        customer_id: billingContext.fullCustomer.id,
        org_id: billingContext.fullCustomer.org_id,
        env: billingContext.fullCustomer.env,
        provider: ProcessorType.CheckoutCom,
        status: trialEnd ? AutumnSubStatus.Trialing : AutumnSubStatus.Incomplete,
        current_period_start: now,
        current_period_end: computePeriodEnd(now, recurringPrice.interval, recurringPrice.interval_count),
        billing_cycle_anchor: now,
        interval: recurringPrice.interval,
        interval_count: recurringPrice.interval_count,
        instrument_id: ckoCtx.ckoInstrument?.id,
        currency: recurringPrice.currency,
        amount: computeRecurringAmount(recurringProducts),
        trial_end: trialEnd,
        cancel_at: undefined,
        canceled_at: undefined,
        cancel_at_period_end: false,
        dunning_attempts: 0,
        next_payment_at: trialEnd ?? now, // charge immediately unless trial
        customer_product_ids: recurringProducts.map((cp: any) => cp.id),
        cko_customer_id: ckoCtx.ckoCustomerId,
        metadata: {},
        created_at: now,
        updated_at: now,
      },
    };
  }

  // Case 2: Existing sub + cancel
  if (existingSub && isCancel) {
    const cancelAction = billingContext.cancelAction;
    const immediate = cancelAction?.type === "immediate";
    return {
      type: "cancel_subscription",
      subscriptionId: existingSub.id,
      cancelAt: immediate ? undefined : existingSub.current_period_end,
      immediate,
    };
  }

  // Case 3: Existing sub + changes (upgrade/downgrade/quantity change)
  if (existingSub && hasRecurringItems) {
    const newAmount = computeRecurringAmount(recurringProducts);
    return {
      type: "update_subscription",
      subscriptionId: existingSub.id,
      updates: {
        amount: newAmount,
        customer_product_ids: [
          ...existingSub.customer_product_ids,
          ...recurringProducts.map((cp: any) => cp.id),
        ],
        updated_at: billingContext.currentEpochMs,
      },
    };
  }

  return undefined;
}
```

### 3.5 Invoice Generation and Payment Collection

Autumn must generate its own invoices for Checkout.com customers:

```typescript
// providers/checkoutCom/invoicing.ts

export interface AutumnInvoice {
  id: string;
  customer_id: string;
  org_id: string;
  env: string;
  subscription_id?: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  currency: string;
  subtotal: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  line_items: AutumnInvoiceLineItem[];
  cko_payment_id?: string;   // pay_* from Checkout.com
  period_start: number;
  period_end: number;
  due_date: number;
  paid_at?: number;
  voided_at?: number;
  created_at: number;
  metadata?: Record<string, string>;
}

/**
 * Called by the subscription scheduler when a billing period ends.
 * Creates an internal invoice and requests payment from Checkout.com.
 */
export async function createAndCollectInvoice(
  ctx: AutumnContext,
  subscription: AutumnSubscription,
): Promise<{ invoice: AutumnInvoice; paymentResult: CkoPaymentResponse }> {
  // 1. Compute line items from subscription's customer products
  const lineItems = await computeInvoiceLineItems(ctx, subscription);

  // 2. Add usage-based charges (consumable prices)
  const usageItems = await computeUsageCharges(ctx, subscription);
  lineItems.push(...usageItems);

  // 3. Create internal invoice
  const invoice: AutumnInvoice = {
    id: generateId("inv"),
    customer_id: subscription.customer_id,
    org_id: subscription.org_id,
    env: subscription.env,
    subscription_id: subscription.id,
    status: "open",
    currency: subscription.currency,
    subtotal: lineItems.reduce((s, li) => s + li.amount, 0),
    total: lineItems.reduce((s, li) => s + li.amount, 0),
    amount_paid: 0,
    amount_due: lineItems.reduce((s, li) => s + li.amount, 0),
    line_items: lineItems,
    period_start: subscription.current_period_start,
    period_end: subscription.current_period_end,
    due_date: subscription.current_period_end,
    created_at: Date.now(),
  };

  await InvoiceService.insert(ctx, invoice);

  // 4. Request payment from Checkout.com
  const paymentResult = await ckoClient.post("/payments", {
    source: { type: "id", id: subscription.instrument_id, stored: true },
    amount: invoice.total,
    currency: invoice.currency.toUpperCase(),
    reference: `autumn_inv_${invoice.id}`,
    capture: true,
    customer: { id: subscription.cko_customer_id },
    merchant_initiated: true,
    payment_type: "Recurring",
    processing_channel_id: getProcessingChannelId(ctx),
    metadata: {
      autumn_invoice_id: invoice.id,
      autumn_subscription_id: subscription.id,
      autumn_customer_id: subscription.customer_id,
    },
    retry: {
      dunning: { enabled: true, max_attempts: 4, end_after_days: 14 },
    },
  });

  // 5. Link payment to invoice
  await InvoiceService.update(ctx, invoice.id, {
    cko_payment_id: paymentResult.id,
    status: paymentResult.approved ? "paid" : "open",
    amount_paid: paymentResult.approved ? invoice.total : 0,
    paid_at: paymentResult.approved ? Date.now() : undefined,
  });

  return { invoice, paymentResult };
}
```

### 3.6 Proration and Upgrade/Downgrade Handling

Since Stripe handles proration natively, Autumn already has `buildAutumnLineItems` / `finalizeLineItems` that compute proration amounts. These are in the provider-agnostic layer — they produce `LineItem[]` with `chargeImmediately` flags.

For Checkout.com, these line items translate directly to payment requests:

- **Immediate proration credit:** Negative line item → stored as credit on the internal invoice, applied to next charge
- **Immediate proration charge:** Positive line item → direct `POST /payments` with stored instrument
- **End-of-cycle charges:** Stored as deferred line items, added to next renewal invoice

```typescript
// providers/checkoutCom/proration.ts

export function handleCkoProration(
  autumnPlan: AutumnBillingPlan,
  subscription: AutumnSubscription,
): {
  immediateCharge?: CkoDirectPaymentAction;
  creditBalance: number;  // negative amount to apply to next invoice
  deferredItems: LineItem[];
} {
  const immediate = autumnPlan.lineItems?.filter((li) => li.chargeImmediately) ?? [];
  const deferred = autumnPlan.lineItems?.filter((li) => !li.chargeImmediately) ?? [];

  const totalImmediate = immediate.reduce((s, li) => s + li.amount, 0);

  if (totalImmediate > 0) {
    // Net charge — collect immediately
    return {
      immediateCharge: buildCkoDirectPaymentAction(/* ... */),
      creditBalance: 0,
      deferredItems: deferred,
    };
  } else if (totalImmediate < 0) {
    // Net credit — store for next invoice
    return {
      creditBalance: totalImmediate, // negative number
      deferredItems: deferred,
    };
  }

  return { creditBalance: 0, deferredItems: deferred };
}
```

**Credit balance** is stored on the `autumn_subscriptions` table (new column `credit_balance`) and subtracted from the next renewal invoice total.

### 3.7 Trial Management

Trials with Checkout.com are simple — the subscription scheduler delays the first charge:

```typescript
// providers/checkoutCom/trials.ts

export function applyTrialToSubscription(
  subscription: Partial<AutumnSubscription>,
  trialContext?: TrialContext,
): void {
  if (!trialContext?.trialEnd) return;

  subscription.status = AutumnSubStatus.Trialing;
  subscription.trial_end = trialContext.trialEnd;
  subscription.next_payment_at = trialContext.trialEnd; // first charge after trial
}

// In the scheduler:
// if (sub.status === 'trialing' && now >= sub.trial_end) {
//   sub.status = 'active';
//   // charge first payment
// }
```

Trial deduplication logic already exists in `setupAttachTrialContext` and is provider-agnostic.

### 3.8 Webhook Handling

Checkout.com sends far fewer events than Stripe. The webhook surface is simpler because Autumn owns the subscription lifecycle.

```typescript
// providers/checkoutCom/webhooks/ckoWebhookRouter.ts

import { Hono } from "hono";

export const ckoWebhookRouter = new Hono();

ckoWebhookRouter.post("/webhooks/checkout-com/:orgId/:env", 
  ckoSeederMiddleware,
  ckoLoggerMiddleware,
  ckoIdempotencyMiddleware,
  handleCkoWebhookEvent,
);
```

#### Event Dispatcher

```typescript
// providers/checkoutCom/webhooks/handleCkoWebhookEvent.ts

export async function handleCkoWebhookEvent(c: Context) {
  const ctx = getCkoWebhookContext(c);
  const event = ctx.ckoEvent;

  try {
    switch (event.type) {
      case "payment_approved":
        await handlePaymentApproved(ctx, event);
        break;
      case "payment_captured":
        await handlePaymentCaptured(ctx, event);
        break;
      case "payment_declined":
        await handlePaymentDeclined(ctx, event);
        break;
      case "payment_refunded":
        await handlePaymentRefunded(ctx, event);
        break;
      case "payment_voided":
        await handlePaymentVoided(ctx, event);
        break;
      case "payment_canceled":
        await handlePaymentCanceled(ctx, event);
        break;
      case "payment_expired":
        await handlePaymentExpired(ctx, event);
        break;
      default:
        ctx.logger.info(`Unhandled CKO event: ${event.type}`);
    }
  } catch (error) {
    reportToSentry(error, { event });
  }

  return c.json({ received: true }, 200);
}
```

#### Critical Handler: `payment_approved`

This is the Checkout.com equivalent of Stripe's `invoice.paid` — the primary payment confirmation:

```typescript
// providers/checkoutCom/webhooks/handlers/handlePaymentApproved.ts

export async function handlePaymentApproved(
  ctx: CkoWebhookContext,
  event: CkoWebhookEvent,
) {
  const payment = event.data;
  const metadata = payment.metadata;

  // 1. Store payment instrument if this was first payment
  if (payment.source?.id && payment.source?.type === "card") {
    await storeInstrumentFromPayment(ctx, payment.customer.id, payment);
  }

  // 2. Handle deferred billing plan (checkout flow completion)
  if (metadata?.autumn_billing_plan === "deferred") {
    const deferredPlan = await MetadataService.getDeferredBillingPlan(
      ctx, metadata.autumn_metadata_id
    );
    if (deferredPlan) {
      await resumeDeferredBillingPlan(ctx, deferredPlan, "payment");
      return;
    }
  }

  // 3. Handle subscription renewal payment
  if (metadata?.autumn_subscription_id) {
    const subscription = await AutumnSubService.get(ctx, metadata.autumn_subscription_id);
    if (subscription) {
      await handleSubscriptionRenewalPayment(ctx, subscription, payment);
      return;
    }
  }

  // 4. Handle standalone one-time payment
  if (metadata?.autumn_invoice_id) {
    await InvoiceService.update(ctx, metadata.autumn_invoice_id, {
      status: "paid",
      amount_paid: payment.amount,
      cko_payment_id: payment.id,
      paid_at: Date.now(),
    });
  }

  // 5. Send receipt
  await sendEmailReceipt(ctx, payment);
}

async function handleSubscriptionRenewalPayment(
  ctx: CkoWebhookContext,
  subscription: AutumnSubscription,
  payment: CkoPayment,
) {
  // Update subscription: advance period, reset dunning
  const newPeriodStart = subscription.current_period_end;
  const newPeriodEnd = computePeriodEnd(
    newPeriodStart, subscription.interval, subscription.interval_count
  );

  await AutumnSubService.update(ctx, subscription.id, {
    status: AutumnSubStatus.Active,
    current_period_start: newPeriodStart,
    current_period_end: newPeriodEnd,
    next_payment_at: newPeriodEnd,
    dunning_attempts: 0,
    last_dunning_at: undefined,
    updated_at: Date.now(),
  });

  // Reset entitlements for new period
  await resetEntitlementsForPeriod(ctx, subscription);

  // Update invoice
  if (payment.metadata?.autumn_invoice_id) {
    await InvoiceService.update(ctx, payment.metadata.autumn_invoice_id, {
      status: "paid",
      amount_paid: payment.amount,
      paid_at: Date.now(),
    });
  }
}
```

#### Handler: `payment_declined`

```typescript
// providers/checkoutCom/webhooks/handlers/handlePaymentDeclined.ts

export async function handlePaymentDeclined(
  ctx: CkoWebhookContext,
  event: CkoWebhookEvent,
) {
  const payment = event.data;
  const metadata = payment.metadata;

  if (metadata?.autumn_subscription_id) {
    const subscription = await AutumnSubService.get(ctx, metadata.autumn_subscription_id);
    if (!subscription) return;

    // Update dunning state
    await AutumnSubService.update(ctx, subscription.id, {
      status: AutumnSubStatus.PastDue,
      dunning_attempts: subscription.dunning_attempts + 1,
      last_dunning_at: Date.now(),
      updated_at: Date.now(),
    });

    // Sync customer product status
    for (const cpId of subscription.customer_product_ids) {
      await CusProductService.updateStatus(ctx, cpId, "past_due");
    }

    // Check if we should cancel (org setting)
    const org = ctx.org;
    if (org.config?.cancel_on_past_due && subscription.dunning_attempts >= 3) {
      await cancelSubscriptionImmediately(ctx, subscription);
    }

    // Send webhook event
    await sendWebhookEvent(ctx, "customer.subscription.past_due", {
      customer_id: subscription.customer_id,
      subscription_id: subscription.id,
    });
  }
}
```

### 3.9 Refunds and Cancellations

```typescript
// providers/checkoutCom/refunds.ts

export async function refundCkoPayment(
  ctx: AutumnContext,
  paymentId: string, // pay_*
  amount?: number,   // partial refund amount, or undefined for full
): Promise<CkoRefundResponse> {
  const response = await ckoClient.post(`/payments/${paymentId}/refunds`, {
    amount,
    reference: `autumn_refund_${Date.now()}`,
  });

  return response;
}

export async function cancelCkoSubscription(
  ctx: AutumnContext,
  subscriptionId: string,
  options: { immediate: boolean; refundLastPayment?: boolean },
): Promise<void> {
  const sub = await AutumnSubService.get(ctx, subscriptionId);
  if (!sub) throw new Error("Subscription not found");

  if (options.immediate) {
    // Expire immediately
    await AutumnSubService.update(ctx, sub.id, {
      status: AutumnSubStatus.Expired,
      canceled_at: Date.now(),
      updated_at: Date.now(),
    });

    // Expire customer products
    await expireAndActivateCustomerProducts(ctx, sub);

    // Optional refund for unused time
    if (options.refundLastPayment) {
      const lastInvoice = await InvoiceService.getLatestForSubscription(ctx, sub.id);
      if (lastInvoice?.cko_payment_id) {
        const unusedRatio = (sub.current_period_end - Date.now()) /
          (sub.current_period_end - sub.current_period_start);
        const refundAmount = Math.floor(lastInvoice.total * unusedRatio);
        if (refundAmount > 0) {
          await refundCkoPayment(ctx, lastInvoice.cko_payment_id, refundAmount);
        }
      }
    }
  } else {
    // Cancel at period end
    await AutumnSubService.update(ctx, sub.id, {
      cancel_at_period_end: true,
      cancel_at: sub.current_period_end,
      canceled_at: Date.now(),
      updated_at: Date.now(),
    });
  }
}
```

---

## 4. Database Changes

### 4.1 New Tables

#### `autumn_subscriptions`

Autumn-managed subscriptions (used for Checkout.com and any future non-Stripe providers).

```sql
CREATE TABLE autumn_subscriptions (
  id TEXT PRIMARY KEY,                -- autumn_sub_*
  customer_id TEXT NOT NULL REFERENCES customers(id),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  env TEXT NOT NULL,
  provider TEXT NOT NULL,             -- 'checkout_com'

  status TEXT NOT NULL,               -- active, trialing, past_due, canceled, expired, incomplete
  current_period_start BIGINT NOT NULL,
  current_period_end BIGINT NOT NULL,
  billing_cycle_anchor BIGINT NOT NULL,
  interval TEXT NOT NULL,             -- month, year, week, day
  interval_count INT NOT NULL DEFAULT 1,

  instrument_id TEXT,                 -- CKO src_* or null
  currency TEXT NOT NULL,
  amount INT NOT NULL,                -- recurring amount in minor units
  credit_balance INT NOT NULL DEFAULT 0, -- proration credits

  trial_end BIGINT,
  cancel_at BIGINT,
  canceled_at BIGINT,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,

  dunning_attempts INT NOT NULL DEFAULT 0,
  last_dunning_at BIGINT,
  next_payment_at BIGINT NOT NULL,

  customer_product_ids TEXT[] NOT NULL DEFAULT '{}',
  cko_customer_id TEXT,

  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_autumn_subs_next_payment ON autumn_subscriptions(next_payment_at)
  WHERE status IN ('active', 'trialing', 'past_due');
CREATE INDEX idx_autumn_subs_customer ON autumn_subscriptions(customer_id, org_id, env);
```

#### `cko_instruments`

Stored payment instruments from Checkout.com Vault.

```sql
CREATE TABLE cko_instruments (
  id TEXT PRIMARY KEY,               -- src_*
  customer_id TEXT NOT NULL,         -- Autumn customer ID
  cko_customer_id TEXT NOT NULL,     -- cus_*
  org_id TEXT NOT NULL,
  type TEXT NOT NULL,                -- card, bank_account
  last4 TEXT,
  expiry_month INT,
  expiry_year INT,
  fingerprint TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_cko_instruments_customer ON cko_instruments(customer_id, org_id);
```

#### `cko_payments`

Ledger of Checkout.com payments for audit/reconciliation.

```sql
CREATE TABLE cko_payments (
  id TEXT PRIMARY KEY,               -- pay_*
  action_id TEXT,                    -- act_*
  customer_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  env TEXT NOT NULL,
  invoice_id TEXT,                   -- Autumn invoice ID
  subscription_id TEXT,              -- autumn_sub_*
  amount INT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,              -- Authorized, Captured, Declined, Refunded, Voided
  reference TEXT,
  approved BOOLEAN,
  response_code TEXT,
  response_summary TEXT,
  instrument_id TEXT,
  metadata JSONB DEFAULT '{}',
  processed_on BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_cko_payments_customer ON cko_payments(customer_id, org_id);
CREATE INDEX idx_cko_payments_subscription ON cko_payments(subscription_id);
```

### 4.2 Modified Tables

#### `customers` — add `checkout_com` to processor_ids

No schema change needed if `processor_ids` is JSONB (it is). Just store:
```json
{ "stripe": "cus_stripe_xxx", "checkout_com": "cus_cko_xxx" }
```

#### `orgs` — add checkout_com config to `processor_configs`

```json
{
  "checkout_com": {
    "secret_key": "sk_xxx",
    "public_key": "pk_xxx",
    "processing_channel_id": "pc_xxx",
    "webhook_signing_secret": "whsec_xxx",
    "environment": "sandbox" | "production"
  }
}
```

#### `customer_products` — add `provider_refs` column

```sql
ALTER TABLE customer_products ADD COLUMN provider_refs JSONB;
-- Example: {"provider": "checkout_com", "subscription_id": "autumn_sub_xxx", "instrument_id": "src_xxx"}
```

---

## 5. Subscription Scheduler

The scheduler is the most critical new component. It replaces Stripe's automatic subscription management for Checkout.com customers.

### 5.1 Architecture

```
┌──────────────────────┐
│   Cron Job (1 min)   │
│   or Queue Worker    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Poll autumn_subs    │
│  WHERE next_payment  │
│  _at <= NOW()        │
│  AND status IN       │
│  (active, trialing,  │
│   past_due)          │
└──────────┬───────────┘
           │
           ▼
     ┌─────┴─────┐
     │ For each:  │
     ├────────────┤
     │ Trial end? │──▶ Transition trialing → active, charge first payment
     │ Renewal?   │──▶ Create invoice, charge via CKO, advance period
     │ Cancel at? │──▶ Expire subscription and products
     │ Past due?  │──▶ Retry payment (with backoff)
     └────────────┘
```

### 5.2 Implementation

```typescript
// services/scheduler/subscriptionScheduler.ts

const POLL_INTERVAL_MS = 60_000; // 1 minute
const BATCH_SIZE = 100;
const MAX_DUNNING_ATTEMPTS = 6;
const DUNNING_BACKOFF_HOURS = [1, 6, 24, 48, 96, 168]; // exponential-ish

export class SubscriptionScheduler {
  private running = false;

  async start() {
    this.running = true;
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        reportToSentry(error, { component: "SubscriptionScheduler" });
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  stop() { this.running = false; }

  async tick() {
    const now = Date.now();

    // 1. Process subscriptions due for action
    const dueSubs = await db.query(`
      SELECT * FROM autumn_subscriptions
      WHERE next_payment_at <= $1
        AND status IN ('active', 'trialing', 'past_due')
      ORDER BY next_payment_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `, [now, BATCH_SIZE]);

    for (const sub of dueSubs) {
      try {
        await this.processSubscription(sub, now);
      } catch (error) {
        reportToSentry(error, { subscriptionId: sub.id });
      }
    }

    // 2. Process scheduled cancellations
    const cancelDue = await db.query(`
      SELECT * FROM autumn_subscriptions
      WHERE cancel_at <= $1
        AND cancel_at IS NOT NULL
        AND status NOT IN ('expired', 'canceled')
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `, [now, BATCH_SIZE]);

    for (const sub of cancelDue) {
      await this.expireSubscription(sub);
    }
  }

  private async processSubscription(sub: AutumnSubscription, now: number) {
    const ctx = await buildContextForSubscription(sub);

    // Trial ending → activate and charge
    if (sub.status === AutumnSubStatus.Trialing && now >= (sub.trial_end ?? 0)) {
      await AutumnSubService.update(ctx, sub.id, {
        status: AutumnSubStatus.Active,
        updated_at: now,
      });
      // Fall through to charge
    }

    // Check if cancel_at_period_end and period has ended
    if (sub.cancel_at_period_end && now >= sub.current_period_end) {
      await this.expireSubscription(sub);
      return;
    }

    // Renewal: create invoice and charge
    if (sub.status === AutumnSubStatus.Active || sub.status === AutumnSubStatus.Trialing) {
      const { invoice, paymentResult } = await createAndCollectInvoice(ctx, sub);

      if (paymentResult.approved) {
        // Success — period will be advanced by webhook handler (payment_approved)
        // But we also set next_payment_at optimistically
        const newPeriodEnd = computePeriodEnd(
          sub.current_period_end, sub.interval, sub.interval_count
        );
        await AutumnSubService.update(ctx, sub.id, {
          next_payment_at: newPeriodEnd,
          updated_at: now,
        });
      } else {
        // Failed — enter dunning
        await AutumnSubService.update(ctx, sub.id, {
          status: AutumnSubStatus.PastDue,
          dunning_attempts: sub.dunning_attempts + 1,
          last_dunning_at: now,
          next_payment_at: now + (DUNNING_BACKOFF_HOURS[sub.dunning_attempts] ?? 168) * 3600_000,
          updated_at: now,
        });
      }
    }

    // Past due: retry
    if (sub.status === AutumnSubStatus.PastDue) {
      if (sub.dunning_attempts >= MAX_DUNNING_ATTEMPTS) {
        await this.expireSubscription(sub);
        return;
      }

      // Retry the latest open invoice
      const openInvoice = await InvoiceService.getLatestOpenForSubscription(ctx, sub.id);
      if (openInvoice && sub.instrument_id) {
        const retryResult = await ckoClient.post("/payments", {
          source: { type: "id", id: sub.instrument_id, stored: true },
          amount: openInvoice.amount_due,
          currency: openInvoice.currency.toUpperCase(),
          reference: `autumn_retry_${openInvoice.id}_${sub.dunning_attempts}`,
          capture: true,
          customer: { id: sub.cko_customer_id },
          merchant_initiated: true,
          payment_type: "Recurring",
          processing_channel_id: getProcessingChannelId(ctx),
          metadata: {
            autumn_invoice_id: openInvoice.id,
            autumn_subscription_id: sub.id,
          },
        });

        if (!retryResult.approved) {
          await AutumnSubService.update(ctx, sub.id, {
            dunning_attempts: sub.dunning_attempts + 1,
            last_dunning_at: Date.now(),
            next_payment_at: Date.now() + (DUNNING_BACKOFF_HOURS[sub.dunning_attempts] ?? 168) * 3600_000,
          });
        }
        // If approved, webhook handler (payment_approved) handles the rest
      }
    }
  }

  private async expireSubscription(sub: AutumnSubscription) {
    const ctx = await buildContextForSubscription(sub);

    await AutumnSubService.update(ctx, sub.id, {
      status: AutumnSubStatus.Expired,
      updated_at: Date.now(),
    });

    // Expire customer products
    for (const cpId of sub.customer_product_ids) {
      await CusProductService.updateStatus(ctx, cpId, "expired");
    }

    // Activate default products
    await activateDefaultProducts(ctx, sub.customer_id);

    // Void open invoices
    await voidOpenInvoicesForSubscription(ctx, sub.id);

    // Send webhook
    await sendWebhookEvent(ctx, "customer.subscription.expired", {
      customer_id: sub.customer_id,
      subscription_id: sub.id,
    });
  }
}
```

### 5.3 Deployment Options

| Option | Pros | Cons |
|---|---|---|
| **In-process cron** (setInterval in the server) | Simple, no infra | Single instance only, no HA |
| **External cron + HTTP endpoint** (e.g., Render cron job) | Simple, uses existing infra | No concurrency control |
| **Queue-based** (BullMQ/Redis) | Reliable, concurrent, retries | More infrastructure |
| **pg_cron** (Postgres extension) | No app code for scheduling | Limited, tight DB coupling |

**Recommendation:** Start with **in-process cron** gated behind an env var (only one instance runs it), with a `FOR UPDATE SKIP LOCKED` query to handle rare overlap. Migrate to queue-based when scale requires it.

---

## 6. Migration Path

### 6.1 Per-Org Provider Selection

The org already has `processor_configs` (JSONB). Add:

```typescript
// On the Org model
interface Org {
  // ... existing fields ...
  processor_type: ProcessorType;  // NEW — default provider for this org
  processor_configs: {
    stripe?: StripeConfig;
    checkout_com?: CheckoutComConfig;
    revenuecat?: RevenueCatConfig;
    vercel?: VercelConfig;
  };
}
```

Provider selection in the billing pipeline:

```typescript
// In setupAttachBillingContext / setupUpdateSubscriptionBillingContext:

const provider = getOrgProvider(ctx.org);
const providerContext = await provider.setupContext(ctx, customer.id, options);
billingContext.providerContext = providerContext;

// In evaluateAndExecute:
const providerPlan = await provider.evaluate(ctx, billingContext, autumnPlan);
const result = await provider.execute(ctx, { autumn: autumnPlan, provider: providerPlan }, billingContext);
```

### 6.2 Supporting Both Simultaneously

- Different orgs can use different providers. A single org uses one provider at a time.
- Customer records can have both `stripe` and `checkout_com` in `processor_ids` (for future migration scenarios), but billing goes through one provider per org.
- The Stripe webhook routes remain unchanged. Checkout.com gets new routes at `/webhooks/checkout-com/:orgId/:env`.
- Dashboard: add a "Payment Provider" selector in org settings (Stripe or Checkout.com), requiring CKO API keys to be configured first.

### 6.3 Org Onboarding for Checkout.com

1. Org admin enters CKO API keys in dashboard
2. Autumn validates keys by making a test API call (`GET /payment-methods`)
3. Autumn registers webhook URL with CKO (or instructs admin to do it in CKO dashboard)
4. Org `processor_type` set to `checkout_com`
5. New customers use CKO flow; existing Stripe customers continue on Stripe until migrated

---

## 7. File-by-file Implementation Tasks

### Work Stream 1: Provider Abstraction (Foundation)

Must complete first. All other streams depend on this.

| File | Action | Description |
|---|---|---|
| `shared/models/enums/processorType.ts` | Modify | Add `CheckoutCom = "checkout_com"` |
| `shared/providers/billingProvider.ts` | **Create** | Provider interface definition |
| `shared/providers/providerRegistry.ts` | **Create** | Provider registry + `getOrgProvider()` |
| `shared/models/billingModels/context/billingContext.ts` | Modify | Extract Stripe fields to `StripeBillingContext`, add `providerContext` union |
| `shared/models/billingModels/plan/billingPlan.ts` | Modify | Change `stripe` → `provider` (union type) |
| `shared/models/autumnSubscription.ts` | **Create** | Internal subscription model |
| `shared/models/ckoInstrument.ts` | **Create** | CKO instrument model |
| `providers/stripe/stripeBillingProvider.ts` | **Create** | Wrap existing Stripe evaluate/execute into provider interface |
| All files referencing `billingContext.stripeCustomer` etc. | Modify | Access via `billingContext.providerContext` with type guard |
| `setupAttachBillingContext` | Modify | Use provider registry for context setup |
| `setupUpdateSubscriptionBillingContext` | Modify | Same |
| `executeBillingPlan` | Modify | Dispatch to provider.execute() |

### Work Stream 2: Checkout.com Client & Core (Can parallel with Stream 1 interface work)

| File | Action | Description |
|---|---|---|
| `providers/checkoutCom/client.ts` | **Create** | CKO HTTP client (axios/fetch wrapper with auth, error handling) |
| `providers/checkoutCom/types.ts` | **Create** | CKO API request/response types |
| `providers/checkoutCom/customers.ts` | **Create** | Customer CRUD |
| `providers/checkoutCom/instruments.ts` | **Create** | Instrument storage/retrieval |
| `providers/checkoutCom/config.ts` | **Create** | Read CKO config from org.processor_configs |

### Work Stream 3: Checkout.com Billing Provider (Depends on Streams 1 & 2)

| File | Action | Description |
|---|---|---|
| `providers/checkoutCom/checkoutComBillingProvider.ts` | **Create** | Main provider class implementing BillingProvider |
| `providers/checkoutCom/evaluate/evaluateCheckoutComBillingPlan.ts` | **Create** | AutumnBillingPlan → CheckoutComBillingPlan |
| `providers/checkoutCom/evaluate/checkoutComBillingPlan.ts` | **Create** | Type definition |
| `providers/checkoutCom/actions/hostedPaymentAction.ts` | **Create** | Hosted payment page builder |
| `providers/checkoutCom/actions/directPaymentAction.ts` | **Create** | Direct payment builder |
| `providers/checkoutCom/actions/recurringAction.ts` | **Create** | Subscription create/update/cancel builder |
| `providers/checkoutCom/execute/executeCheckoutComBillingPlan.ts` | **Create** | Orchestrated execution |
| `providers/checkoutCom/execute/executeHostedPayment.ts` | **Create** | Create hosted payment session |
| `providers/checkoutCom/execute/executeDirectPayment.ts` | **Create** | Execute direct payment |
| `providers/checkoutCom/execute/executeRecurringAction.ts` | **Create** | Create/update/cancel internal subscription |
| `providers/checkoutCom/invoicing.ts` | **Create** | Invoice generation + payment collection |
| `providers/checkoutCom/proration.ts` | **Create** | Proration handling with credits |
| `providers/checkoutCom/trials.ts` | **Create** | Trial application |
| `providers/checkoutCom/refunds.ts` | **Create** | Refund logic |

### Work Stream 4: Webhooks (Depends on Streams 2 & 3)

| File | Action | Description |
|---|---|---|
| `providers/checkoutCom/webhooks/ckoWebhookRouter.ts` | **Create** | Hono router |
| `providers/checkoutCom/webhooks/middleware/ckoSeederMiddleware.ts` | **Create** | Org resolution + signature verification |
| `providers/checkoutCom/webhooks/middleware/ckoLoggerMiddleware.ts` | **Create** | Structured logging |
| `providers/checkoutCom/webhooks/middleware/ckoIdempotencyMiddleware.ts` | **Create** | Redis dedup |
| `providers/checkoutCom/webhooks/middleware/ckoToAutumnCustomerMiddleware.ts` | **Create** | Resolve CKO customer → Autumn customer |
| `providers/checkoutCom/webhooks/handleCkoWebhookEvent.ts` | **Create** | Event dispatcher |
| `providers/checkoutCom/webhooks/handlers/handlePaymentApproved.ts` | **Create** | Primary payment handler |
| `providers/checkoutCom/webhooks/handlers/handlePaymentCaptured.ts` | **Create** | Capture confirmation |
| `providers/checkoutCom/webhooks/handlers/handlePaymentDeclined.ts` | **Create** | Decline → dunning |
| `providers/checkoutCom/webhooks/handlers/handlePaymentRefunded.ts` | **Create** | Refund processing |
| `providers/checkoutCom/webhooks/handlers/handlePaymentVoided.ts` | **Create** | Void processing |
| `providers/checkoutCom/webhooks/handlers/handlePaymentCanceled.ts` | **Create** | Cancellation cleanup |
| `providers/checkoutCom/webhooks/handlers/handlePaymentExpired.ts` | **Create** | Expiry cleanup |
| `app.ts` (or main router) | Modify | Mount CKO webhook router |

### Work Stream 5: Subscription Scheduler (Depends on Streams 2 & 3)

| File | Action | Description |
|---|---|---|
| `services/scheduler/subscriptionScheduler.ts` | **Create** | Main scheduler loop |
| `services/scheduler/schedulerUtils.ts` | **Create** | Period computation, backoff logic |
| `services/autumnSubService.ts` | **Create** | CRUD for autumn_subscriptions table |
| `server.ts` / `index.ts` | Modify | Start scheduler on boot (behind env flag) |

### Work Stream 6: Database Migrations (Can start early)

| File | Action | Description |
|---|---|---|
| `migrations/XXXX_create_autumn_subscriptions.sql` | **Create** | New table |
| `migrations/XXXX_create_cko_instruments.sql` | **Create** | New table |
| `migrations/XXXX_create_cko_payments.sql` | **Create** | New table |
| `migrations/XXXX_add_provider_refs_to_customer_products.sql` | **Create** | New column |
| `migrations/XXXX_add_processor_type_to_orgs.sql` | **Create** | New column (default 'stripe') |

### Work Stream 7: Dashboard / Org Settings (Can parallel)

| File | Action | Description |
|---|---|---|
| Dashboard org settings page | Modify | Add CKO API key configuration UI |
| Dashboard org settings page | Modify | Add provider selection dropdown |
| API: org config endpoint | Modify | Accept/validate CKO credentials |

---

## 8. Risks and Open Questions

### High Risk

1. **Subscription scheduler reliability** — This is a new critical path. If the scheduler crashes or falls behind, customers don't get charged. Needs monitoring, alerting, and dead-letter handling.

2. **Race conditions** — The `FOR UPDATE SKIP LOCKED` pattern handles basic concurrency, but webhook events arriving simultaneously with scheduler actions need careful dedup. E.g., scheduler charges → `payment_approved` arrives → scheduler also processes the approval.

3. **Proration correctness** — Stripe's proration is battle-tested. Autumn's manual proration for CKO needs extensive testing, especially for mid-cycle upgrades with usage-based components.

4. **3DS for stored cards** — Merchant-initiated recurring payments may trigger 3DS challenges (SCA regulation). Checkout.com supports exemptions, but some will still require customer interaction. How does Autumn handle a 3DS challenge on an automated renewal?

5. **Checkout.com webhook signature verification** — Need to confirm their signing mechanism (HMAC? asymmetric?) and implement verification in the seeder middleware.

### Medium Risk

6. **CKO API rate limits** — Batch renewal processing could hit rate limits. Need throttling in the scheduler.

7. **Multi-currency** — CKO amounts are in minor units (like Stripe), but currency handling needs verification for all supported currencies.

8. **Instrument expiry** — Cards expire. Need a process to handle expired instruments before the scheduler tries to charge them.

9. **Refund timing** — CKO refunds may take days. Need to handle the async refund lifecycle vs Stripe's near-instant refunds.

### Open Questions

10. **Should the scheduler be a separate service or in-process?** In-process is simpler but less resilient. Separate service adds operational overhead.

11. **How does CKO onboarding work?** Do we use OAuth (like Stripe Connect) or manual API key entry? This affects the org setup flow significantly.

12. **Do we need to support CKO Flow (JS SDK)?** The plan assumes Hosted Payments Page, but some orgs may want embedded payment forms.

13. **What about disputes?** CKO has dispute events (`dispute_received`, etc.). Need a dispute handling flow — is this Phase 1 or later?

14. **Usage-based billing accuracy** — For consumable prices, Stripe's `invoice.created` webhook triggers usage reporting just-in-time. With CKO, the scheduler must compute usage accurately at charge time. Timing differences could cause incorrect charges.

15. **Should `autumn_subscriptions` also be used for Stripe subscriptions?** Long-term, having a unified internal subscription model (with Stripe as a payment execution layer) could simplify the architecture. But that's a much bigger refactor.

16. **Network token support** — CKO supports network tokens (Visa Token Service, etc.) which improve approval rates for stored cards. Worth implementing but adds complexity.

---

## 9. Phase Plan

### Phase 1: Foundation + One-Time Payments (4-6 weeks)

**Goal:** Checkout.com orgs can accept one-time payments via Hosted Payments Page.

**Deliverables:**
- Provider abstraction layer (interface, registry, BillingContext refactoring)
- Stripe provider wrapped in new interface (no behavior change)
- CKO client, customer management, instrument storage
- CKO Hosted Payments Page flow (one-time payments only)
- Webhook handling for `payment_approved`, `payment_declined`, `payment_voided`
- Database migrations (all tables)
- Org settings for CKO API keys
- Basic tests

**Verification:** Create a CKO-configured org, attach a one-off product to a customer, complete payment via hosted page, verify product activation.

### Phase 2: Recurring Billing (6-8 weeks)

**Goal:** Checkout.com orgs can create subscriptions with automatic renewal.

**Deliverables:**
- Subscription scheduler (in-process cron)
- Internal subscription lifecycle (create, renew, cancel at period end)
- Invoice generation + payment collection
- Dunning/retry logic
- Trial support
- Webhook handler for renewal confirmation + decline handling
- Direct payment with stored instruments (returning customer flow)
- Cancel and immediate-cancel flows
- Integration tests with CKO sandbox

**Verification:** Create subscription, verify automatic renewal after period, verify dunning on decline, verify cancellation, verify trial.

### Phase 3: Advanced Features (4-6 weeks)

**Goal:** Feature parity with critical Stripe capabilities.

**Deliverables:**
- Proration for plan upgrades/downgrades
- Credit balance system
- Subscription schedule equivalent (future plan changes)
- Usage-based/metered billing with CKO
- Refund flows (full + partial)
- Dispute handling
- Email receipts
- Dashboard: subscription management views for CKO customers
- Monitoring + alerting for scheduler health
- Production readiness: rate limiting, retry with backoff, dead letter queue

**Verification:** Full regression against Stripe-equivalent test suite. Upgrade/downgrade scenarios. Usage reporting accuracy.

### Phase 4: Polish + Scale (2-4 weeks)

**Deliverables:**
- Queue-based scheduler (BullMQ) if scale requires
- Network token support for improved approval rates
- CKO Flow (JS SDK) integration for embedded payment forms
- Org migration tooling (Stripe → CKO)
- Documentation
- Load testing

---

## Appendix: CheckoutComBillingPlan Type Definition

```typescript
// providers/checkoutCom/evaluate/checkoutComBillingPlan.ts

export interface CheckoutComBillingPlan {
  hostedPaymentAction?: CkoHostedPaymentAction;   // redirect to CKO hosted page
  directPaymentAction?: CkoDirectPaymentAction;    // charge stored instrument
  recurringAction?: CkoRecurringAction;            // create/update/cancel internal sub
  deferredCharges?: LineItem[];                     // charges for next billing cycle
}

export interface CheckoutComBillingPlanResult extends ProviderBillingPlanResult {
  ckoPaymentId?: string;        // pay_* from direct payment
  ckoHostedPageUrl?: string;    // redirect URL from hosted payment
  autumnSubscriptionId?: string; // internal sub ID
  autumnInvoiceId?: string;     // internal invoice ID
}
```

---

*End of plan. Ready for review.*
