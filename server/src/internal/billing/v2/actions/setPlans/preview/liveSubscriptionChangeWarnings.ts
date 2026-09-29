import {
	formatMsToDate,
	notNullish,
	type ProcessorItem,
	type SetPlansPreviewWarning,
	type StripeBillingPlan,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";

type Warning = Omit<SetPlansPreviewWarning, "severity">;

const requestedCancelAtSeconds = (stripeBillingPlan: StripeBillingPlan) => {
	const { subscriptionAction } = stripeBillingPlan;
	if (
		subscriptionAction?.type !== "update" &&
		subscriptionAction?.type !== "create"
	) {
		return undefined;
	}
	const cancelAt = subscriptionAction.params.cancel_at;
	return typeof cancelAt === "number" || cancelAt === null
		? cancelAt
		: undefined;
};

const scheduleEndSeconds = (stripeBillingPlan: StripeBillingPlan) => {
	const scheduleAction = stripeBillingPlan.subscriptionScheduleAction;
	if (scheduleAction?.type !== "create" && scheduleAction?.type !== "update") {
		return undefined;
	}
	if (scheduleAction.params.end_behavior !== "cancel") return undefined;
	const endDate = scheduleAction.params.phases?.at(-1)?.end_date;
	return typeof endDate === "number" ? endDate : undefined;
};

const scheduledCancelWarning = ({
	stripeSubscription,
	stripeBillingPlan,
}: {
	stripeSubscription?: Stripe.Subscription;
	stripeBillingPlan: StripeBillingPlan;
}): Warning | undefined => {
	const requestedCancelAt = requestedCancelAtSeconds(stripeBillingPlan);
	const endsAtSeconds =
		typeof requestedCancelAt === "number"
			? requestedCancelAt
			: scheduleEndSeconds(stripeBillingPlan);

	if (endsAtSeconds !== undefined) {
		return {
			type: "scheduled_cancel_changed",
			message: `The plans end on ${formatMsToDate(secondsToMs(endsAtSeconds))}.`,
		};
	}

	const liveCancelAt = stripeSubscription?.cancel_at;
	if (requestedCancelAt === null && liveCancelAt) {
		return {
			type: "scheduled_cancel_changed",
			message: `The scheduled cancellation on ${formatMsToDate(secondsToMs(liveCancelAt))} is removed.`,
		};
	}

	return undefined;
};

const cycleResetWarning = ({
	cycleResetAt,
}: {
	cycleResetAt?: number;
}): Warning | undefined =>
	cycleResetAt === undefined
		? undefined
		: {
				type: "cycle_reset",
				message: `The billing cycle resets on ${formatMsToDate(cycleResetAt)}.`,
			};

const billingIntervals = (items: ProcessorItem[]) =>
	new Set(
		items
			.map((item) => item.price)
			.filter((price) => price?.interval)
			.map((price) => `${price?.interval_count} ${price?.interval}`),
	);

const intervalChangeWarning = ({
	stripeSubscription,
	liveProcessorItems,
	immediateItems,
}: {
	stripeSubscription?: Stripe.Subscription;
	liveProcessorItems: ProcessorItem[];
	immediateItems: ProcessorItem[];
}): Warning | undefined => {
	if (!stripeSubscription) return undefined;

	const liveIntervals = billingIntervals(liveProcessorItems);
	const newItem = immediateItems.find(
		(item) =>
			item.price?.interval &&
			!liveIntervals.has(`${item.price.interval_count} ${item.price.interval}`),
	);
	if (liveIntervals.size === 0 || !newItem?.price?.interval) return undefined;

	return {
		type: "interval_change_invoices_now",
		message: `Stripe invoices the new ${newItem.price.interval} interval now, and the billing cycle restarts today.`,
	};
};

export const liveSubscriptionChangeWarnings = ({
	stripeSubscription,
	stripeBillingPlan,
	liveProcessorItems,
	immediateItems,
	cycleResetAt,
}: {
	stripeSubscription?: Stripe.Subscription;
	stripeBillingPlan: StripeBillingPlan;
	liveProcessorItems: ProcessorItem[];
	immediateItems: ProcessorItem[];
	cycleResetAt?: number;
}): Warning[] =>
	[
		scheduledCancelWarning({ stripeSubscription, stripeBillingPlan }),
		intervalChangeWarning({
			stripeSubscription,
			liveProcessorItems,
			immediateItems,
		}),
		cycleResetWarning({ cycleResetAt }),
	].filter(notNullish);
