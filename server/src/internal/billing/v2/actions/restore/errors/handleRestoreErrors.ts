import {
	InternalError,
	type StripeBillingPlan,
	type StripeSubscriptionAction,
	type StripeSubscriptionScheduleAction,
} from "@autumn/shared";

const ALLOWED_SUB_ACTION_TYPES = new Set<StripeSubscriptionAction["type"]>([
	"update",
]);

const ALLOWED_SCHEDULE_ACTION_TYPES = new Set<
	StripeSubscriptionScheduleAction["type"]
>(["update", "create"]);

/**
 * Restore must never create new subs, cancel subs, charge invoices, or release
 * schedules. A "release" specifically signals the schedule was never imported
 * into Autumn — silently releasing it would compound the drift restore is meant
 * to fix. Anything other than no-op / update for the subscription, or no-op /
 * update / create for the schedule, throws.
 */
export const handleRestoreErrors = ({
	stripeBillingPlan,
	stripeSubscriptionId,
}: {
	stripeBillingPlan: StripeBillingPlan;
	stripeSubscriptionId: string;
}) => {
	const {
		subscriptionAction,
		subscriptionScheduleAction,
		invoiceAction,
		invoiceItemsAction,
		checkoutSessionAction,
		refundAction,
	} = stripeBillingPlan;

	if (
		subscriptionAction &&
		!ALLOWED_SUB_ACTION_TYPES.has(subscriptionAction.type)
	) {
		throw new InternalError({
			message: `[Restore] Unexpected subscription action '${subscriptionAction.type}' for subscription ${stripeSubscriptionId}. Restore only allows 'update'.`,
			code: "restore_unexpected_subscription_action",
		});
	}

	if (
		subscriptionScheduleAction &&
		!ALLOWED_SCHEDULE_ACTION_TYPES.has(subscriptionScheduleAction.type)
	) {
		throw new InternalError({
			message: `[Restore] Unexpected schedule action '${subscriptionScheduleAction.type}' for subscription ${stripeSubscriptionId}. Restore only allows 'update' or 'create'; 'release' usually means the schedule was never imported into Autumn.`,
			code: "restore_unexpected_schedule_action",
		});
	}

	if (
		invoiceAction ||
		invoiceItemsAction ||
		checkoutSessionAction ||
		refundAction
	) {
		throw new InternalError({
			message: `[Restore] Unexpected non-subscription action produced for ${stripeSubscriptionId}. Restore should only mutate Stripe subscription/schedule state.`,
			code: "restore_unexpected_action",
		});
	}
};
