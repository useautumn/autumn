import type { ChangeEvent, KeyboardEvent } from "react";
import { useState } from "react";

const DEFAULT_SUBMIT_KEYS = ["Enter"];

/** A text draft that submits (trimmed, non-empty) on chosen keys and on blur, then clears. */
export function useDraftValue({
	onSubmit,
	submitKeys = DEFAULT_SUBMIT_KEYS,
}: {
	onSubmit: (value: string) => void;
	submitKeys?: string[];
}) {
	const [draft, setDraft] = useState("");

	const submit = () => {
		const value = draft.trim();
		if (value) onSubmit(value);
		setDraft("");
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!submitKeys.includes(event.key)) return;
		event.preventDefault();
		submit();
	};

	return {
		draft,
		inputProps: {
			value: draft,
			onChange: (event: ChangeEvent<HTMLInputElement>) =>
				setDraft(event.target.value),
			onKeyDown,
			onBlur: submit,
		},
	};
}
