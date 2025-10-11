import type { ProductItem } from "@autumn/shared";
import { useEffect } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { createProductItem, OnboardingStep } from "../utils/onboardingUtils";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";

/**
 * Hook to ensure Step 3 has a valid feature item that matches baseFeature
 * Runs whenever on Step 3 and ensures the feature item is in sync
 */
export const useInitFeatureItem = () => {
	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Get features from query
	const { features } = useFeaturesQuery();

	// Get product state from store
	const product = useProductStore((state) => state.product);
	const setProduct = useProductStore((state) => state.setProduct);
	const setBaseProduct = useProductStore((state) => state.setBaseProduct);

	// Get state from Zustand
	const baseFeature = useFeatureStore((state) => state.baseFeature);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Don't depend on setProduct/setBaseProduct
	useEffect(() => {
		if (!product?.items || !baseFeature?.id) return;

		// Find existing feature item (non-price item with a feature_id)
		const existingFeatureItemIndex = product.items.findIndex(
			(item: ProductItem) => item.feature_id && !item.price_id,
		);

		const updatedItems = [...product.items];
		let needsUpdate = false;

		if (existingFeatureItemIndex === -1) {
			// Create feature item only on Step 3
			if (step === OnboardingStep.FeatureConfiguration && features?.length) {
				updatedItems.push(createProductItem(baseFeature));
				needsUpdate = true;
			}
		} else if (updatedItems[existingFeatureItemIndex].feature_id !== baseFeature.id) {
			// Update feature_id if it changed
			updatedItems[existingFeatureItemIndex] = {
				...updatedItems[existingFeatureItemIndex],
				feature_id: baseFeature.id,
			};
			needsUpdate = true;
		}

		if (needsUpdate) {
			const updatedProduct = { ...product, items: updatedItems };
			setProduct(updatedProduct);
			setBaseProduct(updatedProduct);
		}
	}, [step, product?.items, baseFeature?.id, features?.length]);
};
