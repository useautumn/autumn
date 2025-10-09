import type {
	CreateFeature,
	Feature,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { isPriceItem } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { type MutableRefObject, useCallback } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
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
}

export const useFeatureCreationActions = ({
	feature,
	product,
	axiosInstance,
	featureCreatedRef,
	setFeature,
	setProduct,
	setBaseProduct,
}: FeatureCreationActionsProps) => {
	const { features, refetch: refetchFeatures } = useFeaturesQuery();

	// Create feature and add to product
	const handleProceed = useCallback(async (): Promise<boolean> => {
		// 1. If feature already exists, update it, if not create it
		const createdFeature = await createFeature(
			feature as CreateFeature,
			axiosInstance,
			featureCreatedRef,
		);

		if (!createdFeature) return false;

		await refetchFeatures(); // Refresh features list

		// Create ProductItem and add to product immediately for live editing
		const newItem = createProductItem(createdFeature);

		setFeature(createdFeature);

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
					feature_id: createdFeature.id,
					feature_type: newItem.feature_type,
				};

				console.log("FeatureCreationActions - updated existing product item:", {
					oldFeatureType: oldItem.feature_type,
					newFeatureType: newItem.feature_type,
					featureId: createdFeature.id,
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
