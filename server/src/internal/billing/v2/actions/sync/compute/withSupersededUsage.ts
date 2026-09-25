import type { FullCusProduct } from "@autumn/shared";

/**
 * The carry source for a replaced row that also supersedes other instances of
 * its plan: their entitlements join its own, so usage across all of them carries.
 */
export const withSupersededUsage = ({
	customerProduct,
	supersededInstances = [],
}: {
	customerProduct: FullCusProduct;
	supersededInstances?: FullCusProduct[];
}): FullCusProduct =>
	supersededInstances.length === 0
		? customerProduct
		: {
				...customerProduct,
				customer_entitlements: [
					...customerProduct.customer_entitlements,
					...supersededInstances.flatMap(
						(instance) => instance.customer_entitlements,
					),
				],
			};
