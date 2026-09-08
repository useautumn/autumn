import { useStore } from "@tanstack/react-form";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { NumericDraftInput } from "./NumericDraftInput";

interface EditableNumberCellProps {
	form: CreditSystemFormInstance;
	fullId: string;
	field: "markup" | "input_cost" | "output_cost";
	useDefaultAsPlaceholder?: boolean;
	inheritedPlaceholder?: number;
	allowUndefined?: boolean;
}

export function EditableNumberCell({
	form,
	fullId,
	field,
	useDefaultAsPlaceholder = false,
	inheritedPlaceholder = 0,
	allowUndefined = false,
}: EditableNumberCellProps) {
	const value = useStore(
		form.store,
		(s) => s.values.model_markups[fullId]?.[field],
	);

	const commit = (next: number | undefined) =>
		form.setFieldValue("model_markups", (prev) => {
			const entry = { ...prev[fullId] };
			if (next === undefined) delete entry[field];
			else entry[field] = next;
			return { ...prev, [fullId]: entry };
		});

	return (
		<NumericDraftInput
			variant="headless"
			value={value ?? undefined}
			onCommit={commit}
			allowUndefined={allowUndefined}
			placeholder={useDefaultAsPlaceholder ? String(inheritedPlaceholder) : "0"}
			className="text-sm"
		/>
	);
}
