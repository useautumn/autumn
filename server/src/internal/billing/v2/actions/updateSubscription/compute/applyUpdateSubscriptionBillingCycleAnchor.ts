import type {
	AutumnBillingPlan,
	FullCusProduct,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { applyBillingCycleAnchorToSharedSubscription } from "@/internal/billing/v2/compute/computeAutumnUtils/applyBillingCycleAnchorToSharedSubscription";
import { getRequestedBillingCycleAnchorResetAt } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";
import { customerProductToBillingCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";

const getCustomerProductAnchorUpdates = ({
	billingContext,
	customerProduct,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	customerProduct: FullCusProduct;
}) => {
	const resetAt = getRequestedBillingCycleAnchorResetAt({
		requestedBillingCycleAnchor: billingContext.requestedBillingCycleAnchor,
	});
	if (resetAt !== undefined) {
		return { billing_cycle_anchor_resets_at: resetAt };
	}

	return {
		billing_cycle_anchor: customerProductToBillingCycleAnchor({
			customerProduct,
			billingCycleAnchor: billingContext.billingCycleAnchorMs,
			now: billingContext.currentEpochMs,
		}),
		billing_cycle_anchor_resets_at: null,
	};
};

export const applyUpdateSubscriptionBillingCycleAnchor = ({
	plan,
	billingContext,
}: {
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	if (billingContext.requestedBillingCycleAnchor === undefined) return plan;

	const [insertedCustomerProduct, ...otherInsertedCustomerProducts] =
		plan.insertCustomerProducts;
	const planWithInsertedAnchor = insertedCustomerProduct
		? {
				...plan,
				insertCustomerProducts: [
					{
						...insertedCustomerProduct,
						...getCustomerProductAnchorUpdates({
							billingContext,
							customerProduct: insertedCustomerProduct,
						}),
					},
					...otherInsertedCustomerProducts,
				],
			}
		: plan;

	return applyBillingCycleAnchorToSharedSubscription({
		plan: planWithInsertedAnchor,
		billingContext,
		stripeSubscriptionId:
			billingContext.stripeSubscription?.id ??
			billingContext.customerProduct.subscription_ids?.[0],
	});
};
