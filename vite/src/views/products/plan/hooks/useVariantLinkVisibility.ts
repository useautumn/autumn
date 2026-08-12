import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// base_id lives on the products-list entry, not the store product.
	const listedProduct = products.find((p) => p.id === product.id);
	const listedBasePlanId = listedProduct?.base_id || null;
	// A plan whose base row is another of its own versions resolves to its own id.
	const isSelfReferentialBase = listedBasePlanId === product.id;
	const basePlanId = isSelfReferentialBase ? null : listedBasePlanId;
	const basePlan = products.find((p) => p.id === basePlanId) ?? null;
	const hasVariants = products.some(
		(p) => p.id !== product.id && p.base_id === product.id,
	);
	// The backend rejects a variant as a base plan.
	const basePlanOptions = products.filter(
		(candidate) =>
			candidate.id !== product.id && !candidate.base_id && !candidate.archived,
	);

	// The editor leaves base_id undefined until edited; null means detach.
	const selectedBasePlanId =
		product.base_id === undefined ? basePlanId : product.base_id;

	return {
		isVariant: basePlanId !== null,
		hasVariants,
		basePlanId,
		selectedBasePlanId,
		basePlan,
		basePlanOptions,
	};
}
