import type {
	Entitlement,
	FeatureOptions,
	FreeTrial,
	FullCusProduct,
	FullProduct,
	Price,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";
import type Stripe from "stripe";
import { z } from "zod/v4";

export const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

export interface TrialContext {
	freeTrial?: FreeTrial | null;
	trialEndsAt: number | null;
	customFreeTrial?: FreeTrial;
	appliesToBilling: boolean;
}

export interface BillingContext {
	fullCustomer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	fullProducts: FullProduct[];

	featureQuantities: FeatureOptions[];
	invoiceMode?: InvoiceMode;

	// Timestamps...
	currentEpochMs: number;
	billingCycleAnchorMs: number | "now";
	resetCycleAnchorMs: number | "now";

	// Stripe context
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeDiscounts?: StripeDiscountWithCoupon[];
	paymentMethod?: Stripe.PaymentMethod;

	// Unforunately, need to add custom prices, custom entitlements and free trial here, because it's determined in the setup step.
	customPrices: Price[];
	customEnts: Entitlement[];

	// Trial context
	trialContext?: TrialContext;
	isCustom: boolean;
}

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
}

// testClockFrozenTime?: number;
