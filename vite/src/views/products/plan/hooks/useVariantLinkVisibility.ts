import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// base_id lives on the products-list entry, not the store product.
	const listedProduct = products.find((p) => p.id === product.id);
	// A self-referential base_id is not a real link.
	const basePlanId =
		listedProduct?.base_id && listedProduct.base_id !== product.id
			? listedProduct.base_id
			: null;
	const basePlan = products.find((p) => p.id === basePlanId) ?? null;
	const hasVariants = products.some(
		(p) => p.id !== product.id && p.base_id === product.id,
	);
	// The backend rejects a variant as a base plan.
	const basePlanOptions = products.filter(
		(candidate) =>
			candidate.id !== product.id && !candidate.base_id && !candidate.archived,
	);

	return {
		isVariant: basePlanId !== null,
		hasVariants,
		basePlanId,
		basePlan,
		basePlanOptions,
	};
}
