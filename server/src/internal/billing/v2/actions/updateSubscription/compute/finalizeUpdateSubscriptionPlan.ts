import {
	type AutumnBillingPlan,
	isCustomerProductOneOff,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeRefundPlan } from "@/internal/billing/v2/compute/finalize/computeRefundPlan";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { customerProductToBillingCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";

const applyAnchorResetCustomerProductUpdate = ({
	plan,
	billingContext,
}: {
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	if (billingContext.requestedBillingCycleAnchor !== "now") return plan;

	return {
		...plan,
		updateCustomerProduct: {
			customerProduct: billingContext.customerProduct,
			updates: {
				...plan.updateCustomerProduct?.updates,
				billing_cycle_anchor: customerProductToBillingCycleAnchor({
					customerProduct: billingContext.customerProduct,
					billingCycleAnchor: billingContext.billingCycleAnchorMs,
					now: billingContext.currentEpochMs,
				}),
			},
		},
	};
};

/**
 * Finalizes the update subscription billing plan by processing line items,
 * applying update-subscription-specific guards, and computing refund preview.
 */
export const finalizeUpdateSubscriptionPlan = async ({
	ctx,
	plan,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): Promise<AutumnBillingPlan> => {
	plan = applyAnchorResetCustomerProductUpdate({ plan, billingContext });

	// Finalize line items (shared logic)
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext,
		autumnBillingPlan: plan,
	});

	// Guard: if current customer product is one off, make sure there are no line items
	if (isCustomerProductOneOff(billingContext.customerProduct)) {
		plan.lineItems = [];
	}

	// Filter refund line items and compute the refund plan
	const { lineItems: filteredLineItems, refundPlan } = await computeRefundPlan({
		ctx,
		billingContext,
		lineItems: plan.lineItems ?? [],
	});

	plan.lineItems = filteredLineItems;
	plan.refundPlan = refundPlan;

	return plan;
};
