import {
	type BillingContext,
	formatAmount,
	formatMsToDate,
	type SetPlansPreviewWarning,
	type StripeBillingPlan,
	secondsToMs,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionStateAction } from "../utils/subscriptionStateAction";

export type SubscriptionWarningContext = Pick<
	BillingContext,
	| "currentEpochMs"
	| "billingCycleAnchorMs"
	| "subscriptionBackdateStartMs"
	| "stripeSubscription"
	| "replacedStripeSubscription"
	| "stripeDiscounts"
	| "trialContext"
>;

type Warning = Omit<SetPlansPreviewWarning, "severity">;

/** Cancelling an incomplete subscription makes Stripe void its first invoice. */
const stripeVoidsOpenInvoices = (subscription: Stripe.Subscription) =>
	subscription.status === "incomplete";

const replacedSubscriptionWarning = ({
	replacedStripeSubscription,
	stripeBillingPlan,
	billingContext,
}: {
	replacedStripeSubscription: Stripe.Subscription;
	stripeBillingPlan: StripeBillingPlan;
	billingContext: SubscriptionWarningContext;
}): Warning | undefined => {
	const { warning } = subscriptionStateAction({
		state: replacedStripeSubscription.status,
	});

	if (warning === "subscription_replaced") {
		const whenCancelled = stripeBillingPlan.checkoutSessionAction
			? " once checkout completes"
			: "";
		const invoiceOutcome = stripeVoidsOpenInvoices(replacedStripeSubscription)
			? "Stripe voids its first invoice."
			: "Its unpaid invoices stay open.";
		return {
			type: warning,
			message: `The ${replacedStripeSubscription.status} subscription ${replacedStripeSubscription.id} will be cancelled${whenCancelled} and a new one created. ${invoiceOutcome}`,
		};
	}

	if (warning === "new_stripe_subscription") {
		const {
			currentEpochMs,
			subscriptionBackdateStartMs,
			billingCycleAnchorMs,
		} = billingContext;
		const firstInvoiceMs =
			billingCycleAnchorMs === "now" ? currentEpochMs : billingCycleAnchorMs;
		return {
			type: warning,
			message: `A new Stripe subscription will be created, starting ${formatMsToDate(subscriptionBackdateStartMs ?? currentEpochMs)} and first invoiced on ${formatMsToDate(firstInvoiceMs)}.`,
		};
	}

	return undefined;
};

const describeInvoice = (invoice: Stripe.Invoice) =>
	`Invoice ${invoice.number ?? invoice.id} for ${formatAmount({
		currency: invoice.currency,
		amount: stripeToAtmnAmount({
			amount: invoice.amount_remaining,
			currency: invoice.currency,
		}),
	})}`;

const openInvoiceWarnings = (openInvoices: Stripe.Invoice[]): Warning[] =>
	openInvoices.map((invoice) => ({
		type: "open_invoice_not_collected",
		message: `${describeInvoice(invoice)} is still open on the cancelled subscription and is not collected by this change.`,
	}));

const pastDueInvoiceWarnings = ({
	stripeSubscription,
	liveOpenInvoices,
}: {
	stripeSubscription?: Stripe.Subscription;
	liveOpenInvoices: Stripe.Invoice[];
}): Warning[] =>
	stripeSubscription?.status === "past_due"
		? liveOpenInvoices.map((invoice) => ({
				type: "past_due_invoice_open",
				message: `${describeInvoice(invoice)} is open; Stripe keeps retrying it.`,
			}))
		: [];

const discountCoupon = (discount: string | Stripe.Discount) => {
	if (typeof discount === "string") return undefined;
	const coupon = discount.source?.coupon;
	return typeof coupon === "object" && coupon ? coupon : undefined;
};

const droppedDiscountWarnings = ({
	replacedStripeSubscription,
	stripeDiscounts = [],
}: {
	replacedStripeSubscription: Stripe.Subscription;
	stripeDiscounts?: BillingContext["stripeDiscounts"];
}): Warning[] => {
	const carriedCouponIds = new Set(
		stripeDiscounts.map((discount) => discount.source.coupon.id),
	);
	return (replacedStripeSubscription.discounts ?? [])
		.map(discountCoupon)
		.filter((coupon) => coupon && !carriedCouponIds.has(coupon.id))
		.map((coupon) => ({
			type: "discount_not_carried",
			message: `Discount ${coupon?.name ?? coupon?.id} from the cancelled subscription is not carried over.`,
		}));
};

const trialEndedWarning = ({
	stripeSubscription,
	trialContext,
}: SubscriptionWarningContext): Warning | undefined => {
	const endsLiveTrial =
		stripeSubscription?.status === "trialing" && !trialContext?.trialEndsAt;
	if (!endsLiveTrial) return undefined;

	return {
		type: "trial_ended",
		message: `The trial ending ${formatMsToDate(secondsToMs(stripeSubscription.trial_end ?? undefined))} ends now and the subscription is billed immediately.`,
	};
};

/** Warnings for what set_plans does to the customer's current Stripe subscription. */
export const subscriptionStateToWarnings = ({
	billingContext,
	stripeBillingPlan,
	replacedOpenInvoices = [],
	liveOpenInvoices = [],
}: {
	billingContext?: SubscriptionWarningContext;
	stripeBillingPlan?: StripeBillingPlan;
	replacedOpenInvoices?: Stripe.Invoice[];
	liveOpenInvoices?: Stripe.Invoice[];
}): Warning[] => {
	if (!billingContext) return [];
	const { replacedStripeSubscription } = billingContext;

	const replacedWarnings = replacedStripeSubscription
		? [
				replacedSubscriptionWarning({
					replacedStripeSubscription,
					stripeBillingPlan: stripeBillingPlan ?? {},
					billingContext,
				}),
				...(stripeVoidsOpenInvoices(replacedStripeSubscription)
					? []
					: openInvoiceWarnings(replacedOpenInvoices)),
				...droppedDiscountWarnings({
					replacedStripeSubscription,
					stripeDiscounts: billingContext.stripeDiscounts,
				}),
			]
		: [];

	return [
		...replacedWarnings,
		...pastDueInvoiceWarnings({
			stripeSubscription: billingContext.stripeSubscription,
			liveOpenInvoices,
		}),
		trialEndedWarning(billingContext),
	].filter((warning): warning is Warning => warning !== undefined);
};
