import { Input } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";

interface EditableNumberCellProps {
	form: CreditSystemFormInstance;
	fullId: string;
	field: "markup" | "input_cost" | "output_cost";
	useDefaultAsPlaceholder?: boolean;
	/** Effective inherited markup (provider default, else global default) shown as the placeholder. */
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
	const currentValue = useStore(
		form.store,
		(s) => s.values.model_markups[fullId]?.[field],
	);
	const placeholder = useDefaultAsPlaceholder
		? String(inheritedPlaceholder)
		: "0";
	const [local, setLocal] = useState("");
	const [focused, setFocused] = useState(false);

	const hasValue = currentValue != null;
	const displayed = focused ? local : hasValue ? String(currentValue) : "";

	return (
		<Input
			variant="headless"
			type="text"
			inputMode="numeric"
			value={displayed}
			onChange={(e) => {
				const raw = e.target.value;
				if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
					setLocal(raw);
					if (raw === "" && allowUndefined) {
						form.setFieldValue("model_markups", (prev) => {
							const entry = { ...prev[fullId] };
							delete entry[field];
							return { ...prev, [fullId]: entry };
						});
					} else if (raw !== "") {
						const parsed = Number(raw);
						if (!Number.isNaN(parsed)) {
							form.setFieldValue("model_markups", (prev) => ({
								...prev,
								[fullId]: { ...prev[fullId], [field]: parsed },
							}));
						}
					}
				}
			}}
			onFocus={() => {
				setLocal(hasValue ? String(currentValue) : "");
				setFocused(true);
			}}
			onBlur={() => {
				setFocused(false);
				if (local === "" && !allowUndefined) {
					form.setFieldValue("model_markups", (prev) => ({
						...prev,
						[fullId]: { ...prev[fullId], [field]: 0 },
					}));
				}
			}}
			placeholder={placeholder}
			className="text-sm"
		/>
	);
}
