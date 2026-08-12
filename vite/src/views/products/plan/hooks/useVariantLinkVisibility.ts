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

	// On the editor's working copy base_id is undefined until edited, null to detach.
	const selectedBasePlanId =
		product.base_id === undefined ? basePlanId : (product.base_id ?? null);

	return {
		isVariant: basePlanId !== null,
		hasVariants,
		basePlanId,
		selectedBasePlanId,
		basePlan,
		basePlanOptions,
	};
}
