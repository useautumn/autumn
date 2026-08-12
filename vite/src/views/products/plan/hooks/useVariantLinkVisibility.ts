import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

/**
 * Variant relationships for a plan, plus the plans it may be linked under.
 */
export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// base_id lives on the products-list entry, not the store product.
	const listedProduct = products.find((p) => p.id === product.id);
	// A self-referential base_id is not a real link, so it reads as unlinked.
	const basePlanId =
		listedProduct?.base_id && listedProduct.base_id !== product.id
			? listedProduct.base_id
			: null;
	const basePlan = products.find((p) => p.id === basePlanId) ?? null;
	const hasVariants = products.some(
		(p) => p.id !== product.id && p.base_id === product.id,
	);
	// The backend rejects a variant as a base plan, and archived plans are never
	// sensible targets.
	const basePlanOptions = products.filter(
		(candidate) =>
			candidate.id !== product.id && !candidate.base_id && !candidate.archived,
	);

	const isVariant = basePlanId !== null;
	const isArchived = !!(listedProduct?.archived ?? product.archived);

	return {
		isVariant,
		hasVariants,
		basePlanId,
		basePlan,
		basePlanOptions,
		canLink: !(isVariant || hasVariants || isArchived),
		canDetach: isVariant,
	};
}
