import { useState } from "react";

interface CreditDimensionNameInputProps {
	field: string;
	onRename: (to: string) => void;
	/** True when the typed name is already used by another dimension. */
	isTaken: (name: string) => boolean;
}

/**
 * Names commit on blur or enter; an empty name reverts, since rules match on it.
 * The draft is kept after committing — naming a row changes its identity, so
 * clearing here would blank the input before the renamed row arrives.
 */
export function CreditDimensionNameInput({
	field,
	onRename,
	isTaken,
}: CreditDimensionNameInputProps) {
	const [draft, setDraft] = useState<string | null>(null);

	// A committed name arrives back as `field`; anything else means the rename
	// was rejected, so the draft stays for the user to correct.
	if (draft !== null && draft.trim() === field) setDraft(null);

	const duplicate = draft !== null && isTaken(draft.trim());

	const commit = () => {
		const next = (draft ?? "").trim();
		if (!next || next === field || isTaken(next)) return setDraft(null);
		onRename(next);
	};

	return (
		<input
			type="text"
			aria-label={`${field || "New"} dimension name`}
			placeholder="eg. size"
			value={draft ?? field}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter" && !event.nativeEvent.isComposing) {
					event.currentTarget.blur();
				}
			}}
			aria-invalid={duplicate}
			className="min-w-0 flex-1 bg-transparent text-sm outline-none aria-invalid:text-destructive"
			// biome-ignore lint/a11y/noAutofocus: a row is only added by an explicit click
			autoFocus={field === ""}
			autoComplete="off"
			spellCheck={false}
		/>
	);
}
