import { useEffect, useRef } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";

/**
 * Hook to initialize feature when resuming onboarding
 * Loads first feature from existing data if available
 * Note: Product sync is handled by useProductSync
 */
export const useInitFeature = () => {
	const { features } = useFeaturesQuery();

	// Feature store
	const baseFeature = useFeatureStore((state) => state.baseFeature);
	const setBaseFeature = useFeatureStore((state) => state.setBaseFeature);
	const setFeature = useFeatureStore((state) => state.setFeature);

	const hasInitialized = useRef(false);

	// Initialize feature if available (only once)
	useEffect(() => {
		if (!features || features.length === 0) return;
		if (hasInitialized.current) return;

		// Load first feature if not already set in store
		if (!baseFeature) {
			const firstFeature = features[0];
			setBaseFeature(firstFeature);
			setFeature(firstFeature);
			hasInitialized.current = true;
		}
	}, [features, baseFeature, setBaseFeature, setFeature]);
};
