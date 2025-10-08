import type {
	CreateFeature,
	Feature,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { isPriceItem } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { type MutableRefObject, useCallback } from "react";
import { createFeature, createProductItem } from "../../utils/onboardingUtils";

interface FeatureCreationActionsProps {
	feature: Feature | CreateFeature | null;
	product: ProductV2 | null;
	axiosInstance: AxiosInstance;
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	setFeature: (feature: Feature | CreateFeature | null) => void;
	setProduct: (product: ProductV2) => void;
	setBaseProduct: (product: ProductV2) => void;
	refetchFeatures: () => Promise<unknown>;
	setIsLoading: (loading: boolean) => void;
}

export const useFeatureCreationActions = ({
	feature,
	product,
	axiosInstance,
	featureCreatedRef,
	setFeature,
	setProduct,
	setBaseProduct,
	refetchFeatures,
	setIsLoading,
}: FeatureCreationActionsProps) => {
	// Create feature and add to product
	const handleProceed = useCallback(async (): Promise<boolean> => {
		const createdFeature = await createFeature(
			feature as CreateFeature,
			axiosInstance,
			featureCreatedRef,
		);

		if (!createdFeature) return false;

		await refetchFeatures(); // Refresh features list

		// CRITICAL FIX: Re-fetch the specific feature to get the latest data
		// This ensures we have the most current feature type (e.g., single_use -> continuous_use)
		let finalFeatureData = createdFeature;
		try {
			const freshFeatureResponse = await axiosInstance.get(
				`/features/${createdFeature.id}`,
			);
			if (freshFeatureResponse.data) {
				finalFeatureData = freshFeatureResponse.data;
				console.log(
					"FeatureCreationActions - Using fresh feature data from API",
				);
			}
		} catch (_error) {
			console.warn(
				"FeatureCreationActions - Failed to fetch fresh feature, using returned data",
			);
		}

		// Debug: Log the feature data used to create product item
		console.log("FeatureCreationActions - final feature data:", {
			id: finalFeatureData.id,
			type: finalFeatureData.type,
			usage_type: finalFeatureData.config?.usage_type,
			fullConfig: finalFeatureData.config,
		});

		// Create ProductItem and add to product immediately for live editing
		const newItem = createProductItem(finalFeatureData);

		console.log("FeatureCreationActions - newItem created:", {
			feature_id: newItem.feature_id,
			feature_type: newItem.feature_type,
		});

		setFeature(finalFeatureData);

		// Add feature item to product (preserving any existing base price item)
		if (product && "items" in product) {
			const existingItems = product.items || [];

			// Check if we already have a feature item (from previous onboarding attempts)
			const existingFeatureItemIndex = existingItems.findIndex(
				(item: ProductItem) => item.feature_id && !isPriceItem(item),
			);

			let updatedItems: typeof existingItems;

			if (existingFeatureItemIndex !== -1) {
				// Update existing feature item with new feature_id and feature_type
				updatedItems = [...existingItems];
				const oldItem = updatedItems[existingFeatureItemIndex];
				updatedItems[existingFeatureItemIndex] = {
					...updatedItems[existingFeatureItemIndex],
					feature_id: finalFeatureData.id,
					feature_type: newItem.feature_type,
				};

				console.log("FeatureCreationActions - updated existing product item:", {
					oldFeatureType: oldItem.feature_type,
					newFeatureType: newItem.feature_type,
					featureId: finalFeatureData.id,
					changed: oldItem.feature_type !== newItem.feature_type,
				});
			} else {
				// Add new feature item, preserving any existing base price items
				updatedItems = [...existingItems, newItem];
			}

			const updatedProduct = {
				...product,
				items: updatedItems,
			};

			// Update local state (don't save yet - item needs configuration in step 3)
			setProduct(updatedProduct);
			setBaseProduct(updatedProduct);
		}

		return true;
	}, [
		feature,
		axiosInstance,
		featureCreatedRef,
		refetchFeatures,
		setFeature,
		product,
		setProduct,
		setBaseProduct,
	]);

	return {
		handleProceed,
	};
};
