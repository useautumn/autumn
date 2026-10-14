import {
	usePlanSheet,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { PlanSheetFooter } from "@/components/v2/sheets/PlanSheetFooter";

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
