import {
	type AutumnBillingPlan,
	isCustomerProductOneOff,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computeRefundPreview } from "./cancel/computeRefundPreview";

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

	// Compute refund preview from finalised line items
	const previewTotal = (plan.lineItems ?? []).reduce(
		(sum, item) => sum + (item.amount ?? 0),
		0,
	);

	plan.refundPreview = await computeRefundPreview({
		ctx,
		billingContext,
		previewTotal,
	});

	return plan;
};
