import type { ProductV2 } from "@autumn/shared";
import { useCallback } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { trackOnboardingFeatureConfigured } from "@/utils/posthogTracking";
import { updateProduct } from "@/views/products/product/utils/updateProduct";

export const useFeatureConfigActions = () => {
	const axiosInstance = useAxiosInstance();

	// Get product from product store (working copy to save)
	const product = useProductStore((s) => s.product);

	const hasChanges = useHasChanges();

	// Get products refetch
	const { refetch: refetchProducts } = useProductsQuery();

	// Get sheet store
	const setSheet = useSheetStore((state) => state.setSheet);

	// Save product changes before proceeding to playground
	const handleProceed = useCallback(async (): Promise<boolean> => {
		// If no changes, just open the sheet and proceed
		if (!hasChanges) {
			setSheet({ type: "edit-plan" });
			return true;
		}

		const saved = await updateProduct({
			axiosInstance,
			productId: product.id,
			product: product as ProductV2,
			onSuccess: async () => {
				// Refetch products so useInitProductAndFeature can update baseProduct
				await refetchProducts();
			},
		});

		if (!saved) return false;

		// Track feature configuration completion
		trackOnboardingFeatureConfigured();

		// Open edit-plan sheet after successful save
		setSheet({ type: "edit-plan" });

		return true;
	}, [hasChanges, axiosInstance, product, setSheet, refetchProducts]);

	return {
		handleProceed,
	};
};
