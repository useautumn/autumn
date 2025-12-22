import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { FreeTrialPlan } from "@/internal/billing/v2/billingPlan";
import type { UpdateSubscriptionContext } from "@/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import { buildStripeSubscriptionItemsUpdate } from "@/internal/billing/v2/utils/stripeAdapter/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import { buildStripeSubscriptionCreateAction } from "@/internal/billing/v2/utils/stripeAdapter/subscriptions/buildStripeSubscriptionCreateAction";
import { buildStripeSubscriptionUpdateAction } from "@/internal/billing/v2/utils/stripeAdapter/subscriptions/buildStripeSubscriptionUpdateAction";

export const computeSubscriptionUpdateStripeSubscriptionAction = ({
	ctx,
	billingContext,
	newCustomerProduct,
	freeTrialPlan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionContext;
	newCustomerProduct: FullCusProduct;
	freeTrialPlan: FreeTrialPlan;
}) => {
	const { customerProduct, stripeSubscription } = billingContext;

	const subItemsUpdate = buildStripeSubscriptionItemsUpdate({
		ctx,
		billingContext,
		addCustomerProducts: [newCustomerProduct],
		removeCustomerProducts: [customerProduct],
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
		});
	}

	return undefined;
};
