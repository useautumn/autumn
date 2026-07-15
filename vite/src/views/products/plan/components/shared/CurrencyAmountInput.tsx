import { InputGroup, InputGroupAddon, InputGroupInput } from "@autumn/ui";
import { useState } from "react";

export const amountDisplayValue = (amount: number) =>
	amount === 0 ? "" : amount.toString();

export const CurrencyAmountInput = ({
	displayValue,
	currencyCode,
	onRawChange,
	className,
}: {
	displayValue: string;
	currencyCode: string;
	onRawChange: (raw: string) => void;
	className?: string;
}) => {
	const [editingValue, setEditingValue] = useState<string | undefined>();

	const handleChange = (raw: string) => {
		const cleaned = raw.replace(/-/g, "");
		if (cleaned !== "" && Number.isNaN(Number(cleaned))) return;
		setEditingValue(cleaned);
		onRawChange(cleaned);
	};

	return (
		<InputGroup className={className}>
			<InputGroupInput
				inputMode="decimal"
				onBlur={() => setEditingValue(undefined)}
				onChange={(e) => handleChange(e.target.value)}
				onFocus={() => setEditingValue(displayValue)}
				onKeyDown={(e) => {
					if (e.key === "-" || e.key === "Minus") {
						e.preventDefault();
					}
				}}
				placeholder="0.00"
				value={editingValue ?? displayValue}
			/>
			<InputGroupAddon align="inline-end">
				<span className="text-tertiary-foreground text-xs uppercase">
					{currencyCode}
				</span>
			</InputGroupAddon>
		</InputGroup>
	);
};
