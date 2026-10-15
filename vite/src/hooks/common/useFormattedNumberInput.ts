import { type ChangeEvent, useRef, useState } from "react";
import {
	editNumberInput,
	formatNumberInput,
	sanitizeNumberInput,
} from "@/utils/formatUtils/formatNumberInputUtils";

/** Text input props for a comma-formatted number that accepts pasted "1,500" and keeps the typed text while focused. */
export const useFormattedNumberInput = ({
	value,
	onValueChange,
}: {
	value: string;
	onValueChange: (raw: string) => void;
}) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [editingValue, setEditingValue] = useState<string>();

	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		const input = event.target;
		const previousText = editingValue ?? formatNumberInput({ raw: value });
		const edit = editNumberInput({
			text: input.value,
			caret: input.selectionStart ?? input.value.length,
			previousRaw: sanitizeNumberInput({ text: previousText }),
			inputType: (event.nativeEvent as InputEvent).inputType,
		});

		setEditingValue(edit.formatted);
		onValueChange(edit.raw);
		requestAnimationFrame(() =>
			inputRef.current?.setSelectionRange(edit.caret, edit.caret),
		);
	};

	return {
		ref: inputRef,
		inputMode: "decimal" as const,
		value: editingValue ?? formatNumberInput({ raw: value }),
		onChange,
		onFocus: () => setEditingValue(formatNumberInput({ raw: value })),
		onBlur: () => setEditingValue(undefined),
	};
};
