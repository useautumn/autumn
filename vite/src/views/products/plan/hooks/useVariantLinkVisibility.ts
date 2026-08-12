import type { ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// base_id lives on the products-list entry, not the store product.
	return useMemo(() => {
		const current = products.find((p) => p.id === product.id);
		const isVariant = !!current?.base_id && current.base_id !== product.id;
		const hasVariants = products.some((p) => p.base_id === product.id);
		const isArchived = !!(current?.archived ?? product.archived);

		return {
			canLink: !(isVariant || hasVariants || isArchived),
			canDetach: isVariant,
		};
	}, [products, product.id, product.archived]);
}
