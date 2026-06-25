import {
	usePlanSheet,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { PlanSheetFooter } from "@/components/v2/sheets/PlanSheetFooter";

/**
 * Footer for plan-level sheets (plan details, price). Surfaces a Discard/Close
 * button based on whether the sheet has been edited since it opened, reverting on
 * discard. Edits are live, so Save simply closes.
 */
export function PlanSheetFooterContainer({
	sheetType,
}: {
	sheetType: string | null;
}) {
	const { closeSheet } = useSheet();
	const { hasChanges, discard } = usePlanSheet(sheetType);

	return (
		<PlanSheetFooter
			isDirty={hasChanges}
			onDiscard={discard}
			onClose={closeSheet}
			onConfirm={closeSheet}
			confirmLabel="Save"
		/>
	);
}
