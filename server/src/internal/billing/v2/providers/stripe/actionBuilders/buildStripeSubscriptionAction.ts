import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { buildStripeSubscriptionItemsUpdate } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import { buildStripeSubscriptionCreateAction } from "@server/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionCreateAction";
import { buildStripeSubscriptionUpdateAction } from "@server/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionUpdateAction";
import { billingPlanToOneOffStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/billingPlanToOneOffStripeItemSpecs";
import type {
	AutumnBillingPlan,
	BillingContext,
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
} from "@/internal/billing/v2/types";

export const buildStripeSubscriptionAction = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	finalCustomerProducts,
	stripeSubscriptionScheduleAction,
	subscriptionCancelAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	finalCustomerProducts: FullCusProduct[];
	stripeSubscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	subscriptionCancelAt?: number;
}): StripeSubscriptionAction | undefined => {
	const { stripeSubscription } = billingContext;

	const subItemsUpdate = buildStripeSubscriptionItemsUpdate({
		ctx,
		billingContext,
		finalCustomerProducts,
	});

	const oneOffItemSpecs = billingPlanToOneOffStripeItemSpecs({
		ctx,
		autumnBillingPlan,
	});

	const addInvoiceItems = oneOffItemSpecs.map((item) => ({
		price: item.stripePriceId,
		quantity: item.quantity,
	}));

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
			addInvoiceItems,
			subscriptionCancelAt,
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
			stripeSubscriptionScheduleAction,
			subscriptionCancelAt,
		});
	}

	return undefined;
};
