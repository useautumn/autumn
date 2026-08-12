import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

/**
 * Variant-relationship predicates for a plan. `canLink`/`canDetach` cover the
 * common cases; callers with different rules compose the raw flags.
 */
export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// base_id lives on the products-list entry, not the store product.
	const listedProduct = products.find((p) => p.id === product.id);
	// A self-referential base_id is not a real link, so both predicates ignore it.
	const isVariant =
		!!listedProduct?.base_id && listedProduct.base_id !== product.id;
	const hasVariants = products.some(
		(p) => p.id !== product.id && p.base_id === product.id,
	);
	const isArchived = !!(listedProduct?.archived ?? product.archived);

	return {
		isVariant,
		hasVariants,
		isArchived,
		canLink: !(isVariant || hasVariants || isArchived),
		canDetach: isVariant,
	};
}
