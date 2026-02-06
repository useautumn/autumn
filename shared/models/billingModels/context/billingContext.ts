import type {
	CancelAction,
	Entitlement,
	FeatureOptions,
	FreeTrial,
	Price,
} from "@autumn/shared";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type Stripe from "stripe";
import { z } from "zod/v4";
import type { FullCustomer } from "../../cusModels/fullCusModel";
import type { FullProduct } from "../../productModels/productModels";
import type { StripeDiscountWithCoupon } from "../stripe/stripeDiscountWithCoupon";

const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

export enum BillingVersion {
	V1 = "v1",
	V2 = "v2",
}

export const LATEST_BILLING_VERSION = BillingVersion.V2;
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
	transitionConfigs?: TransitionConfig[];
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

	billingVersion: BillingVersion;
}
