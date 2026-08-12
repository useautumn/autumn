import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

/**
 * Linking is only offered on standalone, unarchived plans; detaching is only
 * offered on plans that already have a base.
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
		canLink: !(isVariant || hasVariants || isArchived),
		canDetach: isVariant,
	};
}
