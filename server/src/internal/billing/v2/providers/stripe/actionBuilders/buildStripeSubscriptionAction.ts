import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type {
	FreeTrialPlan,
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
} from "@server/internal/billing/v2/billingPlan";
import { buildStripeSubscriptionItemsUpdate } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import { buildStripeSubscriptionCreateAction } from "@server/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionCreateAction";
import { buildStripeSubscriptionUpdateAction } from "@server/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionUpdateAction";
import type { UpdateSubscriptionContext } from "@server/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";

export const buildStripeSubscriptionAction = ({
	ctx,
	billingContext,
	updatedCustomerProducts,
	stripeSubscriptionScheduleAction,
	freeTrialPlan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionContext;
	updatedCustomerProducts: FullCusProduct[];
	stripeSubscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	freeTrialPlan?: FreeTrialPlan;
}): StripeSubscriptionAction | undefined => {
	const { stripeSubscription } = billingContext;

	const subItemsUpdate = buildStripeSubscriptionItemsUpdate({
		ctx,
		billingContext,
		updatedCustomerProducts,
	});

	// 1. Compute the action type

	// Case 1: No subscription and sub items update is empty -> no action
	if (!stripeSubscription && subItemsUpdate.length === 0) {
		return undefined;
	}

	// Case 2: No subscription and sub items update not empty -> create subscription
	if (!stripeSubscription && subItemsUpdate.length > 0) {
		return buildStripeSubscriptionCreateAction({
			ctx,
			billingContext,
			subItemsUpdate,
			addInvoiceItems: [],
		});
	}

	// Case 3: Cancel subscription
	if (
		stripeSubscription &&
		subItemsUpdate.length === stripeSubscription.items.data.length &&
		subItemsUpdate.every((item) => item.deleted)
	) {
		return {
			type: "cancel" as const,
			stripeSubscriptionId: stripeSubscription.id,
		};
	}

	// Case 4: Update subscription
	if (stripeSubscription) {
		return buildStripeSubscriptionUpdateAction({
			ctx,
			billingContext,
			subItemsUpdate,
			freeTrialPlan,
			stripeSubscriptionScheduleAction,
		});
	}

	return undefined;
};
