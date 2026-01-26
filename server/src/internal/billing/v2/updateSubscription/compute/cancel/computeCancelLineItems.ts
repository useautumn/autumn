import type { LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";

/**
 * Computes prorated refund line items for immediate cancellation.
 * Returns empty array if not an immediate cancellation.
 */
export const computeCancelLineItems = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
}): LineItem[] => {
	if (billingContext.cancelAction !== "cancel_immediately") return [];

	return buildAutumnLineItems({
		ctx,
		newCustomerProducts: [],
		deletedCustomerProduct: billingContext.customerProduct,
		billingContext,
	});
};
