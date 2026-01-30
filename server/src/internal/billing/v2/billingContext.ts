import type {
	Entitlement,
	FeatureOptions,
	FreeTrial,
	FullCusProduct,
	FullProduct,
	Price,
	RefundBehavior,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import type { CancelAction } from "@shared/api/common/cancelMode";
import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";
import type Stripe from "stripe";
import { z } from "zod/v4";

const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

export interface TrialContext {
	freeTrial?: FreeTrial | null;
	trialEndsAt: number | null;
	customFreeTrial?: FreeTrial;
	appliesToBilling: boolean;
	cardRequired: boolean;
}

export interface BillingContext {
	fullCustomer: FullCustomer;
	fullProducts: FullProduct[];

	featureQuantities: FeatureOptions[];
	invoiceMode?: InvoiceMode;

	// Timestamps...
	currentEpochMs: number;
	billingCycleAnchorMs: number | "now";
	resetCycleAnchorMs: number | "now";

	// Stripe context
	stripeCustomer: Stripe.Customer;
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeDiscounts?: StripeDiscountWithCoupon[];
	paymentMethod?: Stripe.PaymentMethod;

	// Unforunately, need to add custom prices, custom entitlements and free trial here, because it's determined in the setup step.
	// Optional - only needed for custom plan flows
	customPrices?: Price[];
	customEnts?: Entitlement[];

	// Trial context
	trialContext?: TrialContext;
	isCustom?: boolean;

	// Cancel action (used by update subscription for uncancel)
	cancelAction?: CancelAction;

	// Refund behavior for negative invoice totals (downgrades)
	refundBehavior?: RefundBehavior;
}

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
	defaultProduct?: FullProduct; // for cancel flows
	cancelAction?: CancelAction; // for cancel flows
}
