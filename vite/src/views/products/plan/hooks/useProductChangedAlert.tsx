import { useCallback } from "react";
import { useIsCusPlanEditor } from "@/hooks/stores/useProductStore";
import { useBlocker } from "@/views/products/product/hooks/useBlocker";

const DEFAULT_MESSAGE =
	"Are you sure you want to leave without updating the plan? Your changes will be lost.";

export const useProductChangedAlert = ({
	hasChanges,
	disabled = false,
}: {
	hasChanges: boolean;
	disabled?: boolean;
}) => {
	const isCusPlanEditor = useIsCusPlanEditor();
	// Confirm function using native browser dialog
	const showConfirm = useCallback((): boolean => {
		return window.confirm(DEFAULT_MESSAGE);
	}, []);

	// Block client-side React Router navigation only
	useBlocker({
		shouldBlock: hasChanges && !disabled && !isCusPlanEditor,
		confirmFn: showConfirm,
	});
};
