import {
	type AttachBodyV1,
	type FreeTrial,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerPrice,
	type FullProduct,
	type LineItem,
	LineItemSchema,
} from "@autumn/shared";
import type Stripe from "stripe";
import { z } from "zod/v4";
import type { StripeInvoiceAction } from "./types/billingPlan";

export type AttachContext = {
	fullCus: FullCustomer;
	products: FullProduct[];
	freeTrial?: FreeTrial;

	// Stripe context
	stripeSub?: Stripe.Subscription;
	stripeCus: Stripe.Customer;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;

	body: AttachBodyV1;
};

export type StripeSubAction = {
	type:
		| "create"
		| "update"
		| "cancel_immediately"
		| "cancel_at_period_end"
		| "none";
	subId?: string;
	items?: Stripe.SubscriptionUpdateParams.Item[];
};

export type StripeCheckoutAction = {
	shouldCreate: boolean;
	reason?: string;
	params: Stripe.Checkout.SessionCreateParams;
};

export type UpdateOneOffAction = {
	targetCusProduct: FullCusProduct;
};

export type AttachPlan = {
	lineItems: LineItem[];

	// 1. Autumn actions

	updateOneOffAction?: UpdateOneOffAction;
	newCusProducts: FullCusProduct[];

	// 2. Checkout session?
	stripeCheckoutAction: StripeCheckoutAction;
	stripeSubAction: StripeSubAction;
	stripeInvoiceAction?: StripeInvoiceAction;
};

export type BillingPlan = {
	intent: "attach" | "update_quantity" | "update_plan" | "cancel" | "one_off";
};

export const QuantityUpdateDetailsSchema = z.object({
	featureId: z.string(),
	customerEntitlementId: z.string(),
	customerEntitlementBalanceChange: z.number(),
	lineItems: z.array(LineItemSchema),
});

export type QuantityUpdateDetails = z.infer<typeof QuantityUpdateDetailsSchema>;

export type SubscriptionUpdateInvoiceAction = {
	shouldCreateInvoice: boolean;
	invoiceItems: {
		description: string;
		amountDollars: number;
		stripePriceId: string;
		periodStartEpochMs: number;
		periodEndEpochMs: number;
	}[];
	shouldChargeImmediately: boolean;
	paymentMethod?: Stripe.PaymentMethod;
	customerPrices: FullCustomerPrice[];
};
