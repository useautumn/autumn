import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// A plan whose base row is another of its own versions is not a variant.
	const selectedBasePlanId =
		product.base_id && product.base_id !== product.id ? product.base_id : null;
	const basePlan = products.find((p) => p.id === selectedBasePlanId) ?? null;
	const hasVariants = products.some(
		(p) => p.id !== product.id && p.base_id === product.id,
	);
	// The backend rejects a variant as a base plan.
	const basePlanOptions = products.filter(
		(candidate) =>
			candidate.id !== product.id && !candidate.base_id && !candidate.archived,
	);

	return {
		hasVariants,
		selectedBasePlanId,
		basePlan,
		basePlanOptions,
	};
}
