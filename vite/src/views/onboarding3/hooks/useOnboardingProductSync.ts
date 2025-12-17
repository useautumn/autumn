import { useEffect, useRef } from "react";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";

/**
 * Initializes stores for onboarding
 * Always starts fresh with default values to ensure new product/feature are created
 */
export const useOnboardingProductSync = () => {
	const hasInitialized = useRef(false);

	useEffect(() => {
		if (hasInitialized.current) return;

		// Always reset to defaults - onboarding always creates new product and feature
		const { reset: resetProduct } = useProductStore.getState();
		const { reset: resetFeature } = useFeatureStore.getState();
		resetProduct();
		resetFeature();
		hasInitialized.current = true;
	}, []);
};
