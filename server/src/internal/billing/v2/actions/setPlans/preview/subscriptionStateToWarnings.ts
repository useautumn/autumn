import {
	type BillingContext,
	boldText,
	formatAmount,
	formatMsToDate,
	plainText,
	type SetPlansPreviewWarning,
	type StripeBillingPlan,
	secondsToMs,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionStateAction } from "../utils/subscriptionStateAction";
import { billingStartsLaterWarning } from "./billingStartsLaterWarning";
import { warningText } from "./warningText";

export type SubscriptionWarningContext = Pick<
	BillingContext,
	| "currentEpochMs"
	| "billingCycleAnchorMs"
	| "subscriptionBackdateStartMs"
	| "stripeSubscription"
	| "replacedStripeSubscription"
	| "stripeDiscounts"
	| "trialContext"
	| "billingStartsAt"
	| "accessStartsAt"
>;

type Warning = Omit<SetPlansPreviewWarning, "severity">;

/** Cancelling an incomplete subscription makes Stripe void its first invoice. */
const stripeVoidsOpenInvoices = (subscription: Stripe.Subscription) =>
	subscription.status === "incomplete";

const replacedSubscriptionWarning = ({
	replacedStripeSubscription,
	stripeBillingPlan,
}: {
	replacedStripeSubscription: Stripe.Subscription;
	stripeBillingPlan: StripeBillingPlan;
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
			...warningText([
				plainText(`The ${replacedStripeSubscription.status} subscription`),
				boldText(replacedStripeSubscription.id),
				plainText(
					`will be cancelled${whenCancelled} and a new one created. ${invoiceOutcome}`,
				),
			]),
		};
	}

	return undefined;
};

const createsStripeSubscription = (stripeBillingPlan: StripeBillingPlan) =>
	stripeBillingPlan.subscriptionAction?.type === "create" ||
	stripeBillingPlan.checkoutSessionAction?.params.mode === "subscription";

const newSubscriptionWarning = ({
	billingContext,
	stripeBillingPlan,
}: {
	billingContext: SubscriptionWarningContext;
	stripeBillingPlan: StripeBillingPlan;
}): Warning | undefined => {
	const { replacedStripeSubscription, stripeSubscription } = billingContext;
	const state =
		(replacedStripeSubscription ?? stripeSubscription)?.status ?? "none";
	const { warning } = subscriptionStateAction({ state });
	if (warning !== "new_stripe_subscription") return undefined;
	if (!createsStripeSubscription(stripeBillingPlan)) return undefined;

	const { currentEpochMs, subscriptionBackdateStartMs, billingCycleAnchorMs } =
		billingContext;
	const firstInvoiceMs =
		billingCycleAnchorMs === "now" ? currentEpochMs : billingCycleAnchorMs;
	return {
		type: warning,
		...warningText([
			plainText("A new Stripe subscription will be created, starting"),
			boldText(formatMsToDate(subscriptionBackdateStartMs ?? currentEpochMs)),
			plainText("and first invoiced on"),
			boldText(`${formatMsToDate(firstInvoiceMs)}.`),
		]),
	};
};

const describeInvoice = (invoice: Stripe.Invoice) => [
	plainText("Invoice"),
	boldText(invoice.number ?? invoice.id ?? ""),
	plainText("for"),
	boldText(
		formatAmount({
			currency: invoice.currency,
			amount: stripeToAtmnAmount({
				amount: invoice.amount_remaining,
				currency: invoice.currency,
			}),
		}),
	),
];

const openInvoiceWarnings = (openInvoices: Stripe.Invoice[]): Warning[] =>
	openInvoices.map((invoice) => ({
		type: "open_invoice_not_collected",
		...warningText([
			...describeInvoice(invoice),
			plainText(
				"is still open on the cancelled subscription and is not collected by this change.",
			),
		]),
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
				...warningText([
					...describeInvoice(invoice),
					plainText("is open; Stripe keeps retrying it."),
				]),
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
			...warningText([
				plainText("Discount"),
				boldText(coupon?.name ?? coupon?.id ?? ""),
				plainText("from the cancelled subscription is not carried over."),
			]),
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
		...warningText([
			plainText("The trial ending"),
			boldText(
				formatMsToDate(secondsToMs(stripeSubscription.trial_end ?? undefined)),
			),
			plainText("ends now and the subscription is billed immediately."),
		]),
	};
};

/** Warnings for what set_plans does to the customer's current Stripe subscription. */
export const subscriptionStateToWarnings = ({
	billingContext,
	stripeBillingPlan,
	replacedOpenInvoices,
	liveOpenInvoices,
}: {
	billingContext: SubscriptionWarningContext;
	stripeBillingPlan: StripeBillingPlan;
	replacedOpenInvoices: Stripe.Invoice[];
	liveOpenInvoices: Stripe.Invoice[];
}): Warning[] => {
	const { replacedStripeSubscription } = billingContext;

	const replacedWarnings = replacedStripeSubscription
		? [
				replacedSubscriptionWarning({
					replacedStripeSubscription,
					stripeBillingPlan,
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
		newSubscriptionWarning({ billingContext, stripeBillingPlan }),
		...replacedWarnings,
		...pastDueInvoiceWarnings({
			stripeSubscription: billingContext.stripeSubscription,
			liveOpenInvoices,
		}),
		trialEndedWarning(billingContext),
		billingStartsLaterWarning({ billingContext }),
	].filter((warning): warning is Warning => warning !== undefined);
};
