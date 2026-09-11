import type { FullProduct } from "@autumn/shared";

/** Linked customer products first so shared Stripe prices keep the current version. */
export const mergePreferredProductsForDetection = ({
	preferredProducts,
	catalog,
}: {
	preferredProducts?: FullProduct[];
	catalog: FullProduct[];
}): FullProduct[] => {
	if (!preferredProducts?.length) return catalog;

	const preferredInternalIds = new Set(
		preferredProducts.map((product) => product.internal_id),
	);
	return [
		...preferredProducts,
		...catalog.filter(
			(product) => !preferredInternalIds.has(product.internal_id),
		),
	];
};
