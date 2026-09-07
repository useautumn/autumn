import { Input } from "@autumn/ui";
import { type ComponentProps, useState } from "react";

const NUMERIC_DRAFT_PATTERN = /^-?\d*\.?\d*$/;

type NumericDraftInputProps = Omit<
	ComponentProps<typeof Input>,
	"value" | "onChange"
> & {
	value: number | undefined;
	onCommit: (value: number | undefined) => void;
	allowUndefined?: boolean;
};

// Keeps the raw text while focused so "-" and "1." survive until they parse.
export function NumericDraftInput({
	value,
	onCommit,
	allowUndefined = false,
	...inputProps
}: NumericDraftInputProps) {
	const [draft, setDraft] = useState<string | null>(null);
	const displayed = draft ?? (value == null ? "" : String(value));

	return (
		<Input
			type="text"
			inputMode="numeric"
			{...inputProps}
			value={displayed}
			onFocus={() => setDraft(value == null ? "" : String(value))}
			onChange={(e) => {
				const raw = e.target.value;
				if (!NUMERIC_DRAFT_PATTERN.test(raw)) return;
				setDraft(raw);
				if (raw === "") {
					if (allowUndefined) onCommit(undefined);
					return;
				}
				const parsed = Number(raw);
				if (!Number.isNaN(parsed)) onCommit(parsed);
			}}
			onBlur={() => {
				if (draft === "" && !allowUndefined) onCommit(0);
				setDraft(null);
			}}
		/>
	);
}
