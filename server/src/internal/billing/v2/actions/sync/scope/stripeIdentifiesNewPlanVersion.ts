import { cusProductToPrices, type FullCusProduct } from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";
import type { PhaseMatch } from "../detect/types";

/** Stripe price IDs on this phase that detection attributed to `productId`. */
export const matchedStripePriceIdsForProduct = ({
	phaseMatch,
	productId,
}: {
	phaseMatch: PhaseMatch;
	productId: string;
}): string[] =>
	phaseMatch.item_diffs.flatMap((diff) => {
		if (diff.match.kind === "none") return [];
		if (diff.match.product.id !== productId) return [];
		return diff.stripe.stripe_price_id ? [diff.stripe.stripe_price_id] : [];
	});

const stripePriceIdsOnLinkedProduct = ({
	linkedCustomerProduct,
}: {
	linkedCustomerProduct: FullCusProduct;
}): Set<string> => {
	if (!Array.isArray(linkedCustomerProduct.customer_prices)) {
		return new Set();
	}

	return new Set(
		cusProductToPrices({ cusProduct: linkedCustomerProduct }).flatMap((price) =>
			getStripePriceIdsForAutumnPrice({ price }),
		),
	);
};

/** True only when Stripe carries a price the linked version does not have. */
export const stripeIdentifiesNewPlanVersion = ({
	linkedCustomerProduct,
	incomingStripePriceIds,
}: {
	linkedCustomerProduct: FullCusProduct;
	incomingStripePriceIds: string[];
}): boolean => {
	const linkedStripePriceIds = stripePriceIdsOnLinkedProduct({
		linkedCustomerProduct,
	});
	return incomingStripePriceIds.some(
		(stripePriceId) => !linkedStripePriceIds.has(stripePriceId),
	);
};
