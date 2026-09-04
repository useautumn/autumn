import type { ChangeEvent, KeyboardEvent } from "react";
import { useState } from "react";

/**
 * A text draft that submits (trimmed, non-empty) on enter and on blur, then clears.
 * With `separators`, typed or pasted text splits on them and every piece but the
 * last submits at once — so "a, b, c" becomes three values while "c" stays editable.
 */
export function useDraftValue({
	onSubmit,
	separators,
}: {
	onSubmit: (value: string) => void;
	separators?: RegExp;
}) {
	const [draft, setDraft] = useState("");

	const submitAll = (values: string[]) => {
		for (const value of values.map((v) => v.trim())) {
			if (value) onSubmit(value);
		}
	};

	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		const parts = separators ? event.target.value.split(separators) : [];
		if (parts.length <= 1) return setDraft(event.target.value);
		submitAll(parts.slice(0, -1));
		setDraft(parts[parts.length - 1]);
	};

	const submit = () => {
		submitAll([draft]);
		setDraft("");
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// Enter confirms an IME composition; committing here would eat the value.
		if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
		event.preventDefault();
		submit();
	};

	return {
		draft,
		inputProps: { value: draft, onChange, onKeyDown, onBlur: submit },
	};
}
