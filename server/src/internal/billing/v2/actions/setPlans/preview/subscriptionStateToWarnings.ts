import {
	type BillingContext,
	boldText,
	type CreateScheduleBillingContext,
	currencyInputDecimals,
	formatAmount,
	formatMsToDate,
	type LineItem,
	plainText,
	punctuationText,
	type SetPlansPreviewWarning,
	type SetPlansTextPart,
	type StripeBillingPlan,
	secondsToMs,
	stripeToAtmnAmount,
	sumValues,
} from "@autumn/shared";
import type Stripe from "stripe";
import { backdateGap, billsProratedTime } from "../utils/backdateGap";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { replacedStripeScheduleId } from "../utils/replacedStripeScheduleId";
import { restartsCycleAtBackdatedStart } from "../utils/restartsCycleAtBackdatedStart";
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
	| "requestedProrationBehavior"
> &
	Partial<Pick<CreateScheduleBillingContext, "immediatePhase">>;

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
	// A replaced trialing subscription ends without a charge: Stripe neither invoices nor credits its trial.
	if (replacedStripeSubscription.status === "trialing") {
		return {
			type: "subscription_replaced",
			...warningText([
				plainText("The trialing subscription"),
				boldText(replacedStripeSubscription.id),
				plainText("will be cancelled without a charge and a new one created."),
			]),
		};
	}

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

/** Whether the time before the replaced subscription started is billed, and for how much. */
const backdateGapParts = ({
	billingContext,
	lineItems,
}: {
	billingContext: SubscriptionWarningContext;
	lineItems: LineItem[];
}): SetPlansTextPart[] => {
	const gap = backdateGap({ billingContext });
	if (!gap) return [];

	const gapEnd = formatMsToDate(gap.end);
	if (!billsProratedTime({ billingContext })) {
		return [
			plainText("The time before"),
			boldText(gapEnd),
			plainText("isn't billed."),
		];
	}

	const gapLineItems = lineItems.filter(({ context }) => context.backdate);
	const currency = gapLineItems[0]?.context.currency;
	const currencyDecimals = currencyInputDecimals(currency);
	const gapTotal = formatAmount({
		currency,
		minFractionDigits: currencyDecimals,
		maxFractionDigits: currencyDecimals,
		amount: sumValues(
			gapLineItems.map(({ amountAfterDiscounts }) => amountAfterDiscounts),
		),
	});
	return [
		boldText(gapTotal),
		plainText("is billed now for the time before"),
		boldText(gapEnd),
		punctuationText("."),
	];
};

/** A backdate recreates a healthy subscription from its new start, continuing the paid cycle or restarting it. */
const backdateRecreateWarning = ({
	billingContext,
	lineItems,
}: {
	billingContext: SubscriptionWarningContext;
	lineItems: LineItem[];
}): Warning | undefined => {
	const {
		subscriptionBackdateStartMs,
		billingCycleAnchorMs,
		replacedStripeSubscription,
	} = billingContext;
	if (!isBackdateRecreate({ billingContext })) return undefined;
	if (subscriptionBackdateStartMs === undefined) return undefined;
	if (typeof billingCycleAnchorMs !== "number") return undefined;

	const backdateStart = formatMsToDate(subscriptionBackdateStartMs);
	const renewal = restartsCycleAtBackdatedStart({ billingContext })
		? [
				plainText("The billing cycle restarts from"),
				boldText(backdateStart),
				plainText("and renews on"),
			]
		: [plainText("Billing then continues on")];
	return {
		type: "subscription_recreated_backdated",
		...warningText([
			plainText(
				"The current subscription will be cancelled and recreated from",
			),
			boldText(backdateStart),
			punctuationText("."),
			...(replacedStripeScheduleId({ replacedStripeSubscription })
				? [plainText("Its saved schedule is replaced.")]
				: []),
			...backdateGapParts({ billingContext, lineItems }),
			...renewal,
			boldText(formatMsToDate(billingCycleAnchorMs)),
			punctuationText("."),
		]),
	};
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
			boldText(formatMsToDate(firstInvoiceMs)),
			punctuationText("."),
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
	lineItems,
}: {
	billingContext: SubscriptionWarningContext;
	stripeBillingPlan: StripeBillingPlan;
	replacedOpenInvoices: Stripe.Invoice[];
	liveOpenInvoices: Stripe.Invoice[];
	lineItems: LineItem[];
}): Warning[] => {
	const { replacedStripeSubscription } = billingContext;

	const replacedWarnings = replacedStripeSubscription
		? [
				replacedSubscriptionWarning({
					replacedStripeSubscription,
					stripeBillingPlan,
				}),
				backdateRecreateWarning({ billingContext, lineItems }),
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
		billingStartsLaterWarning({ billingContext, lineItems }),
	].filter((warning): warning is Warning => warning !== undefined);
};
