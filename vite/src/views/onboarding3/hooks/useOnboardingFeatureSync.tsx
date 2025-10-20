import { FeatureType } from "@autumn/shared";
import { useEffect, useRef } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

/**
 * Hook to sync feature store with backend features during onboarding
 * Prioritizes metered features and features already in the product
 * Re-syncs when product changes to ensure feature store matches product
 */
export const useOnboardingFeatureSync = () => {
	const { features } = useFeaturesQuery();
	const product = useProductStore((s) => s.product);
	const sheetType = useSheetStore((s) => s.type);

	// Feature store
	const baseFeature = useFeatureStore((state) => state.baseFeature);
	const setBaseFeature = useFeatureStore((state) => state.setBaseFeature);
	const setFeature = useFeatureStore((state) => state.setFeature);

	const lastProductId = useRef<string | undefined>(undefined);

	// Initialize/sync feature whenever product changes
	useEffect(() => {
		if (!features || features.length === 0) return;

		// Wait for product to load (check if it has an ID)
		if (!product?.id) return;

		// Don't sync while creating a new feature or selecting a feature
		// This allows the new feature sheet to manage its own feature state
		if (sheetType === "new-feature" || sheetType === "select-feature") return;

		// Check if product changed
		const productChanged = lastProductId.current !== product.id;
		lastProductId.current = product.id;

		// Re-sync feature if:
		// 1. Product changed, OR
		// 2. No feature is currently set
		if (!productChanged && baseFeature) return;

		// Step 1: Get feature IDs that are in the product
		const featureIdsInProduct =
			product?.items
				?.filter((item) => item.feature_id)
				.map((item) => item.feature_id) || [];

		// Step 2: Filter features - if product has features, use only those
		let candidateFeatures = features;
		if (featureIdsInProduct.length > 0) {
			candidateFeatures = features.filter((f) =>
				featureIdsInProduct.includes(f.id),
			);
		}

		// Step 3: Sort by metered features first
		candidateFeatures.sort((a, b) => {
			const aIsBoolean = a.type === FeatureType.Boolean;
			const bIsBoolean = b.type === FeatureType.Boolean;
			if (aIsBoolean && !bIsBoolean) return 1;
			if (!aIsBoolean && bIsBoolean) return -1;
			return 0;
		});

		// Step 4: Take the first feature
		const featureToLoad = candidateFeatures[0];

		if (featureToLoad) {
			setBaseFeature(featureToLoad);
			setFeature(featureToLoad);
		}
	}, [
		features,
		product?.id,
		product?.items,
		baseFeature,
		setBaseFeature,
		setFeature,
		sheetType,
	]);
};
