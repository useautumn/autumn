import type { ProductV2 } from "@autumn/shared";
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
	const hasInitialized = useRef(false);
	const lastProductRef = useRef<ProductV2 | null>(null);

	useEffect(() => {
		if (!product) return;

		// Check if this is a new product (ID changed) or if product data changed
		const isNewProduct = lastProductRef.current?.id !== product.id;
		const isProductUpdated = lastProductRef.current !== product;

		if (isNewProduct || isProductUpdated) {
			lastProductRef.current = product;

			// Always update baseProduct to reflect backend state
			setBaseProduct(product);

			// Only update product on initial load or when switching products
			if (!hasInitialized.current || isNewProduct) {
				setProduct(product);
				hasInitialized.current = true;
			}
		}
	}, [product, setBaseProduct, setProduct]);
};
