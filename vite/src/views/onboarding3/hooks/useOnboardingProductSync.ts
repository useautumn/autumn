import { useEffect, useRef } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";

/**
 * Syncs product store with products list for onboarding
 * Similar to useProductSync but uses products array instead of single product
 * Prioritizes product_id from query params if it exists
 */
export const useOnboardingProductSync = () => {
	const { products } = useProductsQuery();
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const { queryStates, setQueryStates } = useOnboarding3QueryState();

	const hasInitialized = useRef(false);

	useEffect(() => {
		// Wait for products to load
		if (products === undefined) return;

		// No products exist - use DEFAULT_PRODUCT
		if (products.length === 0) {
			if (!hasInitialized.current) {
				// Reset to DEFAULT_PRODUCT
				const { reset: resetProduct } = useProductStore.getState();
				resetProduct();
				hasInitialized.current = true;
			}
			return;
		}

		// Products exist - select one based on priority:
		// 1. product_id from query params (if exists in products)
		// 2. First product
		let selectedProduct = products[0];

		if (queryStates.product_id) {
			const productFromQuery = products.find(
				(p) => p.id === queryStates.product_id,
			);
			if (productFromQuery) {
				selectedProduct = productFromQuery;
			}
		}

		// Set both product and baseProduct
		setBaseProduct(selectedProduct);
		setProduct(selectedProduct);

		if (!hasInitialized.current) {
			hasInitialized.current = true;
		}
	}, [products, queryStates.product_id, setBaseProduct, setProduct]);
};
