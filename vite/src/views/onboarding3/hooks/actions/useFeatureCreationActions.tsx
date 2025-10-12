import type { CreateFeature, ProductV2 } from "@autumn/shared";
import { apiFeatureToDbFeature, CreateFeatureSchema } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useCallback } from "react";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	useFeatureStore,
	useHasFeatureChanges,
} from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const useFeatureCreationActions = () => {
	const axiosInstance = useAxiosInstance();
	const { refetch: refetchFeatures } = useFeaturesQuery();

	// Get state from feature store
	const feature = useFeatureStore((state) => state.feature);
	const baseFeature = useFeatureStore((state) => state.baseFeature);
	const setBaseFeature = useFeatureStore((state) => state.setBaseFeature);
	const setFeature = useFeatureStore((state) => state.setFeature);
	const hasFeatureChanges = useHasFeatureChanges();

	// Get product store state
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setProduct = useProductStore((s) => s.setProduct);

	// Create or update feature
	const handleProceed = useCallback(async (): Promise<boolean> => {
		// Validate feature data
		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			toast.error("Invalid feature", {
				description: result.error.issues.map((x) => x.message).join(".\n"),
			});
			return false;
		}

		// If feature exists and no changes, skip update
		if (baseFeature?.id && !hasFeatureChanges) {
			return true;
		}

		try {
			let updatedFeature: CreateFeature;

			// If baseFeature exists (update mode), update it
			if (baseFeature?.id) {
				const { data } = await FeatureService.updateFeature(
					axiosInstance,
					baseFeature.id,
					{
						name: feature.name,
						id: feature.id,
						type: feature.type,
						config: feature.config,
						event_names: feature.event_names,
					},
				);

				updatedFeature = apiFeatureToDbFeature({ apiFeature: data });

				toast.success(`Feature "${feature.name}" updated successfully!`);
			} else {
				// Create new feature
				const { data } = await FeatureService.createFeature(axiosInstance, {
					name: feature.name,
					id: feature.id,
					type: feature.type,
					config: feature.config,
					event_names: feature.event_names,
				});
				updatedFeature = apiFeatureToDbFeature({ apiFeature: data });
				toast.success(`Feature "${feature.name}" created successfully!`);
			}

			console.log("Updated feature", updatedFeature);
			if (!updatedFeature?.id) return false;

			await refetchFeatures(); // Refresh features list

			// Update both base and working copy after successful save
			setBaseFeature(updatedFeature);
			setFeature(updatedFeature);

			// Refetch product from backend to sync changes (e.g., entitlement updates when feature type changes)
			// This is critical because handleFeatureTypeChanged may update entitlements on the backend
			if (baseProduct?.id) {
				const { data } = await axiosInstance.get<{
					products: ProductV2[];
					groupToDefaults: Record<string, Record<string, ProductV2>>;
				}>("/products/products");

				const syncedProduct = data.products.find(
					(p) => p.id === baseProduct.id,
				);

				if (syncedProduct) {
					// Sync both base and working copy with backend state
					useProductStore.getState().setBaseProduct(syncedProduct);
					setProduct(syncedProduct);
				}
			}

			// Note: Feature item creation is now handled by useInitFeatureItem when entering Step 3
			// This ensures proper initialization on both normal flow and refresh scenarios

			return true;
		} catch (error: unknown) {
			console.error("Failed to create/update feature:", error);
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create/update feature"),
			);
			return false;
		}
	}, [
		feature,
		baseFeature,
		baseProduct,
		axiosInstance,
		refetchFeatures,
		setBaseFeature,
		setFeature,
		setProduct,
		hasFeatureChanges,
	]);

	return {
		handleProceed,
	};
};
