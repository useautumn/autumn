import type {
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";

export const computeCancelLineItems = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
}): LineItem[] => {
	if (billingContext.cancelAction !== "cancel_immediately") return [];

	if (billingContext.refundLastPayment === "full") return [];

	const { allLineItems } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: [],
		deletedCustomerProduct: billingContext.customerProduct,
		billingContext,
	});

	return allLineItems;
};
