import {
	ACTIVE_STATUSES,
	CusProductStatus,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";

const ONGOING_STATUSES = [...ACTIVE_STATUSES, CusProductStatus.Trialing];

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

	const ongoingCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts,
		stripeSubscriptionId,
	}).filter(
		(customerProduct) =>
			ONGOING_STATUSES.includes(customerProduct.status) &&
			!customerProduct.ended_at,
	);

	return new Set(
		ongoingCustomerProducts.flatMap((customerProduct) =>
			customerProduct.customer_prices.flatMap((customerPrice) =>
				getStripePriceIdsForAutumnPrice({ price: customerPrice.price }),
			),
		),
	);
};
