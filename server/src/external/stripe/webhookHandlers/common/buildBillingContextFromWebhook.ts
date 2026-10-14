import type { BillingContext } from "@autumn/shared";
import {
	BillingVersion,
	type FullCusProduct,
	type FullCustomer,
	ms,
	type StripeDiscountWithCoupon,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";

export interface BaseWebhookEventContext {
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer: ExpandedStripeCustomer;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	nowMs: number;
	paymentMethod: Stripe.PaymentMethod | null;
}

export const buildBillingContextForArrearInvoice = ({
	eventContext,
	periodEndMs,
}: {
	eventContext: BaseWebhookEventContext;
	periodEndMs?: number;
}): BillingContext => {
	const { stripeSubscription, fullCustomer, paymentMethod, nowMs } =
		eventContext;

	const effectivePeriodEndMs = periodEndMs ?? nowMs;

	const justBeforePeriodEndMs = effectivePeriodEndMs - ms.minutes(30);

	return {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],

		currentEpochMs: justBeforePeriodEndMs,
		billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
		resetCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),

		stripeCustomer: stripeSubscription.customer,
		stripeSubscription,
		paymentMethod: paymentMethod ?? undefined,

		billingVersion: BillingVersion.V2,
	};
};

export const buildBillingContextForInAdvanceInvoice = ({
	eventContext,
	periodEndMs,
}: {
	eventContext: BaseWebhookEventContext;
	periodEndMs: number;
}): BillingContext => {
	const { stripeSubscription, fullCustomer, paymentMethod } = eventContext;

	return {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],

		currentEpochMs: periodEndMs,
		billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
		resetCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),

		stripeCustomer: stripeSubscription.customer,
		stripeSubscription,
		paymentMethod: paymentMethod ?? undefined,

		billingVersion: BillingVersion.V2,
	};
};

export const buildBillingContextForInvoicePreview = ({
	fullCustomer,
	stripeSubscription,
	stripeCustomer,
	stripeDiscounts,
	nowMs,
}: {
	fullCustomer: FullCustomer;
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer?: Stripe.Customer;
	stripeDiscounts?: StripeDiscountWithCoupon[];
	nowMs: number;
}): BillingContext => ({
	fullCustomer,
	fullProducts: [],
	featureQuantities: [],

	currentEpochMs: nowMs,
	billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
	resetCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),

	stripeCustomer: stripeCustomer ?? stripeSubscription.customer,
	stripeSubscription,
	stripeDiscounts,

	billingVersion: BillingVersion.V2,
});
