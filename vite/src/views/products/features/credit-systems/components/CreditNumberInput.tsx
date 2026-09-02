import { Input } from "@autumn/ui";
import type { ComponentProps } from "react";
import { useState } from "react";

interface CreditNumberInputProps {
	value: number | undefined;
	onValueChange: (value: number) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	variant?: ComponentProps<typeof Input>["variant"];
	ariaLabel: string;
}

/** Numeric field that keeps partially-typed values ("1.", "") local so the form
 * only ever holds numbers. */
export function CreditNumberInput({
	value,
	onValueChange,
	placeholder,
	className,
	disabled,
	variant,
	ariaLabel,
}: CreditNumberInputProps) {
	const [draft, setDraft] = useState<string | null>(null);

	return (
		<Input
			aria-label={ariaLabel}
			type="text"
			inputMode="decimal"
			lang="en"
			variant={variant}
			className={className}
			disabled={disabled}
			placeholder={placeholder}
			value={draft ?? (value == null ? "" : String(value))}
			onChange={(e) => {
				const raw = e.target.value;
				if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;

				setDraft(raw);
				const parsed = Number(raw);
				if (raw !== "" && Number.isFinite(parsed)) onValueChange(parsed);
			}}
			onBlur={() => {
				if (draft === "") onValueChange(0);
				setDraft(null);
			}}
		/>
	);
}
