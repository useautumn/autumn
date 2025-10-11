import type { CreateFeature } from "@autumn/shared";
import { apiFeatureToDbFeature, CreateFeatureSchema } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useCallback } from "react";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
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
		axiosInstance,
		refetchFeatures,
		setBaseFeature,
		setFeature,
	]);

	return {
		handleProceed,
	};
};
