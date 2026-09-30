import {
	type FullCusProduct,
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";

/** Stripe prices of plans on the subscription that run with no end date, i.e.
 * the ones a released schedule leaves billing. */
export const customerProductsToOngoingStripePriceIds = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string;
}): Set<string> => {
	if (!stripeSubscriptionId) return new Set();

	const ongoingCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: filterCustomerProductsByStripeSubscriptionId({
			customerProducts,
			stripeSubscriptionId,
		}),
	}).filter((customerProduct) => !customerProduct.ended_at);

	return new Set(
		ongoingCustomerProducts.flatMap((customerProduct) =>
			customerProduct.customer_prices.flatMap((customerPrice) =>
				getStripePriceIdsForAutumnPrice({ price: customerPrice.price }),
			),
		),
	);
};
