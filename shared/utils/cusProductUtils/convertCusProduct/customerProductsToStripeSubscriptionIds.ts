import { deduplicateArray, type FullCusProduct } from "../../..";

export const customerProductsToStripeSubscriptionIds = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) => {
	return deduplicateArray(
		customerProducts.flatMap((cp) => cp.subscription_ids),
	);
};
