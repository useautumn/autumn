import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import {
	isCustomerProductInStripeSubscriptionScope,
	isCustomerProductUnlinked,
	isCustomerProductUnlinkedFree,
} from "../classifyCustomerProduct/classifyCustomerProduct";

/** The plans editing one Stripe subscription covers: those billed on it or its schedule, plus
 * plans no subscription bills. Set Plans takes every unlinked plan; sync only the free ones. */
export const filterCustomerProductsByStripeSubscriptionScope = ({
	customerProducts,
	stripeSubscriptionId,
	stripeScheduleId,
	unlinkedPlans = "free",
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
	unlinkedPlans?: "free" | "all";
}): FullCusProduct[] => {
	const isUnlinkedInScope =
		unlinkedPlans === "all"
			? isCustomerProductUnlinked
			: isCustomerProductUnlinkedFree;
	return customerProducts.filter(
		(customerProduct) =>
			isCustomerProductInStripeSubscriptionScope({
				customerProduct,
				stripeSubscriptionId,
				stripeSubscriptionScheduleId: stripeScheduleId,
			}) || isUnlinkedInScope(customerProduct),
	);
};
