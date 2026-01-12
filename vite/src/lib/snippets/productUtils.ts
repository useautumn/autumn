import type { ProductV2 } from "@autumn/shared";

/**
 * Gets the first paid product (product with a price)
 */
export function getFirstPaidProduct({
	products,
}: {
	products: ProductV2[];
}): ProductV2 | null {
	if (!products || products.length === 0) return null;

	// Filter to non-archived, non-add-on products
	const basePlans = products.filter((p) => !p.archived && !p.is_add_on);

	// Find first product with a price
	const paidProduct = basePlans.find((product) =>
		product.items?.some(
			(item) => item.price != null || (item.tiers && item.tiers.length > 0),
		),
	);

	return paidProduct ?? null;
}
