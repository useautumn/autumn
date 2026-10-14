import { useCallback } from "react";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

export const useOpenAddFeatureSheet = () => {
	const { features } = useFeaturesQuery();
	const { setSheet } = useSheet();

	return useCallback(() => {
		if (features.length === 0) {
			setSheet({ type: "new-feature", itemId: "new" });
		} else {
			setSheet({ type: "select-feature", itemId: "select" });
		}
	}, [features.length, setSheet]);
};
