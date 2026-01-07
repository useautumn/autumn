import type {
	FeatureOptions,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";
import type Stripe from "stripe";
import { z } from "zod/v4";

export const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

export interface BillingContext {
	fullCustomer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	fullProducts: FullProduct[];

	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	paymentMethod?: Stripe.PaymentMethod;

	// Timestamps...
	currentEpochMs: number;
	billingCycleAnchorMs: number | "now";

	// Invoice mode
	invoiceMode?: InvoiceMode;

	// Feature quantities
	featureQuantities: FeatureOptions[];
}

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
}

// testClockFrozenTime?: number;
