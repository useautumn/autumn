import { useCallback } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

/**
 * Hook to open the appropriate "add feature" sheet.
 * Opens "new-feature" if no features exist, otherwise opens "select-feature".
 */
export const useOpenAddFeatureSheet = () => {
	const { features } = useFeaturesQuery();
	const setSheet = useSheetStore((s) => s.setSheet);

	return useCallback(() => {
		if (features.length === 0) {
			setSheet({ type: "new-feature", itemId: "new" });
		} else {
			setSheet({ type: "select-feature", itemId: "select" });
		}
	}, [features.length, setSheet]);
};
