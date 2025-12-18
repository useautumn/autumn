import type { FrontendProduct, ProductV2 } from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
import { useEffect, useRef } from "react";
import { useProductStore } from "./useProductStore";

/**
 * Syncs product store with backend data (single product query)
 */
export const useProductSync = ({
	product,
}: {
	product: ProductV2 | undefined;
}) => {
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const currentProduct = useProductStore((s) => s.product);
	const hasInitialized = useRef(false);
	const lastProductRef = useRef<ProductV2 | null>(null);

	useEffect(() => {
		if (!product) return;

		// Check if this is a new product (ID changed) or if product data changed
		const isNewProduct = lastProductRef.current?.id !== product.id;
		const isVersionChanged =
			lastProductRef.current?.version !== product.version;
		const isProductUpdated = lastProductRef.current !== product;

		if (isNewProduct || isProductUpdated) {
			lastProductRef.current = product;

			// Convert ProductV2 to FrontendProduct
			const frontendProduct = productV2ToFrontendProduct({ product });

			// Always update baseProduct to reflect backend state
			setBaseProduct(frontendProduct);

			// Update product on initial load, when switching products, or when version changes
			if (!hasInitialized.current || isNewProduct || isVersionChanged) {
				// Preserve frontend-only fields during creation flow, so Free vs Variable shows correctly
				const shouldPreserveFrontendFields =
					!currentProduct?.internal_id && product.items.length === 0;

				const mergedProduct: FrontendProduct = shouldPreserveFrontendFields
					? {
							...frontendProduct,
							basePriceType:
								currentProduct?.basePriceType ?? frontendProduct.basePriceType,
							planType: currentProduct?.planType ?? frontendProduct.planType,
						}
					: frontendProduct;

				setProduct(mergedProduct);
				hasInitialized.current = true;
			}
		}
	}, [product, setBaseProduct, setProduct, currentProduct]);
};
