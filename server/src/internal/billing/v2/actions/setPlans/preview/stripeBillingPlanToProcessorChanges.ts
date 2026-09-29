import type {
	ProcessorChange,
	StripeBillingPlan,
	StripeCheckoutSessionAction,
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import type Stripe from "stripe";

const subscriptionChange = ({
	id,
	action,
}: Pick<ProcessorChange, "id" | "action">): ProcessorChange => ({
	type: "subscription",
	id,
	action,
});

const scheduleChange = ({
	id,
	action,
}: Pick<ProcessorChange, "id" | "action">): ProcessorChange => ({
	type: "subscription_schedule",
	id,
	action,
});

const checkoutCreatesSubscription = (
	checkoutSessionAction?: StripeCheckoutSessionAction,
) => checkoutSessionAction?.params.mode === "subscription";

const subscriptionActionToProcessorChanges = ({
	subscriptionAction,
	checkoutSessionAction,
}: {
	subscriptionAction?: StripeSubscriptionAction;
	checkoutSessionAction?: StripeCheckoutSessionAction;
}): ProcessorChange[] => {
	if (checkoutCreatesSubscription(checkoutSessionAction)) {
		return [subscriptionChange({ id: null, action: "created" })];
	}

	switch (subscriptionAction?.type) {
		case "create":
			return [subscriptionChange({ id: null, action: "created" })];
		case "update":
		case "cancel_at_period_end":
			return [
				subscriptionChange({
					id: subscriptionAction.stripeSubscriptionId,
					action: "updated",
				}),
			];
		case "cancel":
		case "cancel_immediately":
			return [
				subscriptionChange({
					id: subscriptionAction.stripeSubscriptionId,
					action: "canceled",
				}),
			];
		default:
			return [];
	}
};

const scheduleActionToProcessorChanges = ({
	subscriptionScheduleAction,
	stripeSubscriptionSchedule,
}: {
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
}): ProcessorChange[] => {
	switch (subscriptionScheduleAction?.type) {
		case "create":
			return [scheduleChange({ id: null, action: "created" })];
		case "update": {
			const { stripeSubscriptionScheduleId } = subscriptionScheduleAction;
			if (!stripeSubscriptionSchedule?.subscription) {
				return [
					scheduleChange({
						id: stripeSubscriptionScheduleId,
						action: "updated",
					}),
				];
			}

			return [
				scheduleChange({
					id: stripeSubscriptionScheduleId,
					action: "released",
				}),
				scheduleChange({ id: null, action: "created" }),
			];
		}
		case "release":
			return [
				scheduleChange({
					id: subscriptionScheduleAction.stripeSubscriptionScheduleId,
					action: "released",
				}),
			];
		case "cancel":
			return [
				scheduleChange({
					id: subscriptionScheduleAction.stripeSubscriptionScheduleId,
					action: "canceled",
				}),
			];
		default:
			return [];
	}
};

export const stripeBillingPlanToProcessorChanges = ({
	stripeBillingPlan,
	stripeSubscriptionSchedule,
}: {
	stripeBillingPlan: StripeBillingPlan;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
}): ProcessorChange[] => [
	...subscriptionActionToProcessorChanges({
		subscriptionAction: stripeBillingPlan.subscriptionAction,
		checkoutSessionAction: stripeBillingPlan.checkoutSessionAction,
	}),
	...scheduleActionToProcessorChanges({
		subscriptionScheduleAction: stripeBillingPlan.subscriptionScheduleAction,
		stripeSubscriptionSchedule,
	}),
];
