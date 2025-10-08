import type { ProductV2 } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { useCallback } from "react";

interface FeatureConfigActionsProps {
	product: ProductV2 | null;
	diff: { hasChanges: boolean };
	axiosInstance: AxiosInstance;
	handleRefetch: () => Promise<void>;
	setSheet: (sheet: string | null) => void;
	setEditingState: (state: {
		type: "plan" | "feature" | null;
		id: string | null;
	}) => void;
}

export const useFeatureConfigActions = ({
	product,
	diff,
	axiosInstance,
	handleRefetch,
	setSheet,
	setEditingState,
}: FeatureConfigActionsProps) => {
	// Save product changes before proceeding to playground
	const handleProceed = useCallback(async (): Promise<boolean> => {
		// If no changes, just open the sheet and proceed
		if (!diff.hasChanges) {
			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
			return true;
		}

		// Save changes
		const { updateProduct } = await import(
			"../../../products/product/utils/updateProduct"
		);

		const saved = await updateProduct({
			axiosInstance,
			product: product as ProductV2,
			onSuccess: async () => {
				await handleRefetch();
			},
		});

		if (!saved) return false;

		// Open edit-plan sheet after successful save
		setSheet("edit-plan");
		setEditingState({ type: "plan", id: null });

		return true;
	}, [
		diff.hasChanges,
		axiosInstance,
		product,
		handleRefetch,
		setSheet,
		setEditingState,
	]);

	return {
		handleProceed,
	};
};
