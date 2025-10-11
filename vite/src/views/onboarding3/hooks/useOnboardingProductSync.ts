import { useEffect, useRef } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";
import { OnboardingStep } from "../utils/onboardingUtils";

/**
 * Syncs product store with products list for onboarding
 * Similar to useProductSync but uses products array instead of single product
 */
export const useOnboardingProductSync = () => {
	const { products } = useProductsQuery();
	const product = useProductStore((s) => s.product);
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const { setQueryStates } = useOnboarding3QueryState();

	const hasInitialized = useRef(false);

	useEffect(() => {
		// If no products exist and we've already initialized, redirect to step 1
		if (hasInitialized.current && (!products || products.length === 0)) {
			setQueryStates({ step: OnboardingStep.PlanDetails });
			return;
		}

		if (!products || products.length === 0) return;

		// Get the current product from the list (match by ID if product exists, otherwise first)
		const currentProduct = product?.id
			? products.find((p) => p.id === product.id) || products[0]
			: products[0];

		if (!currentProduct) return;

		// Check if current product was deleted (current product ID not in products list)
		const wasProductDeleted =
			hasInitialized.current &&
			product?.id &&
			!products.find((p) => p.id === product.id);

		// Always update baseProduct to reflect latest backend state
		setBaseProduct(currentProduct);

		// Update product in these cases:
		// 1. Initial load (hasInitialized is false)
		// 2. Current product was deleted (wasProductDeleted is true) - fallback to products[0]
		if (!hasInitialized.current || wasProductDeleted) {
			setProduct(currentProduct);
			hasInitialized.current = true;
		}
	}, [products, product?.id, setBaseProduct, setProduct, setQueryStates]);
};
