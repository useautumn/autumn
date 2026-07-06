import {
	type AdditionalCurrencyPrice,
	roundToCurrencyPrecision,
} from "@autumn/shared";
import { IconButton, InputGroup, InputGroupInput } from "@autumn/ui";
import { TrashSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CurrencyPicker } from "./CurrencyPicker";

export const AdditionalCurrenciesEditor = ({
	currencies,
	onChange,
	baseCurrency,
}: {
	currencies: AdditionalCurrencyPrice[] | null | undefined;
	onChange: (currencies: AdditionalCurrencyPrice[]) => void;
	baseCurrency: string;
}) => {
	const entries = currencies ?? [];
	const [editingAmounts, setEditingAmounts] = useState<
		Record<number, string | undefined>
	>({});

	const updateAmount = (index: number, raw: string) => {
		setEditingAmounts((prev) => ({ ...prev, [index]: raw }));
		const parsed = Number.parseFloat(raw);
		const next = [...entries];
		next[index] = {
			...next[index],
			amount: Number.isNaN(parsed)
				? 0
				: roundToCurrencyPrecision(Math.max(0, parsed), next[index].currency),
		};
		onChange(next);
	};

	const displayAmount = (index: number, amount: number) => {
		const editing = editingAmounts[index];
		if (editing !== undefined) return editing;
		return amount === 0 ? "" : amount.toString();
	};

	return (
		<div className="space-y-1.5">
			{entries.map((entry, index) => (
				<div
					className="flex items-center gap-2"
					key={`currency-${
						// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, codes are picked once
						index
					}`}
				>
					<span className="w-16 shrink-0 text-tertiary-foreground text-xs uppercase">
						{entry.currency}
					</span>
					<InputGroup>
						<InputGroupInput
							inputMode="decimal"
							onBlur={() =>
								setEditingAmounts((prev) => ({ ...prev, [index]: undefined }))
							}
							onChange={(e) => updateAmount(index, e.target.value)}
							onFocus={() =>
								setEditingAmounts((prev) => ({
									...prev,
									[index]: entry.amount === 0 ? "" : entry.amount.toString(),
								}))
							}
							onKeyDown={(e) => {
								if (e.key === "-" || e.key === "Minus") {
									e.preventDefault();
								}
							}}
							placeholder="0.00"
							value={displayAmount(index, entry.amount)}
						/>
					</InputGroup>
					<IconButton
						className="shrink-0 p-1 text-tertiary-foreground hover:text-red-500"
						icon={<TrashSimpleIcon size={10} />}
						onClick={() => onChange(entries.filter((_, i) => i !== index))}
						variant="muted"
					/>
				</div>
			))}
			<CurrencyPicker
				excludedCodes={[baseCurrency, ...entries.map((e) => e.currency)]}
				label={
					entries.length === 0
						? `Add currency (base ${baseCurrency.toUpperCase()})`
						: "Add currency"
				}
				onSelect={(code) =>
					onChange([...entries, { currency: code, amount: 0 }])
				}
			/>
		</div>
	);
};
