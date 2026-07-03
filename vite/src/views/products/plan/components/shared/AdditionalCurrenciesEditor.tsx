import type { AdditionalCurrencyPrice } from "@autumn/shared";
import { IconButton, Input, InputGroup, InputGroupInput } from "@autumn/ui";
import { PlusIcon, TrashSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

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

	const updateEntry = (
		index: number,
		patch: Partial<AdditionalCurrencyPrice>,
	) => {
		const next = [...entries];
		next[index] = { ...next[index], ...patch };
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
					key={`currency-${
						// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional while codes are edited
						index
					}`}
					className="flex gap-2 items-center"
				>
					<Input
						value={entry.currency}
						onChange={(e) =>
							updateEntry(index, {
								currency: e.target.value
									.replace(/[^a-zA-Z]/g, "")
									.toLowerCase()
									.slice(0, 3),
							})
						}
						placeholder="eur"
						className="w-16 shrink-0 uppercase"
						maxLength={3}
					/>
					<InputGroup>
						<InputGroupInput
							value={displayAmount(index, entry.amount)}
							onFocus={() =>
								setEditingAmounts((prev) => ({
									...prev,
									[index]: entry.amount === 0 ? "" : entry.amount.toString(),
								}))
							}
							onChange={(e) => {
								const raw = e.target.value;
								setEditingAmounts((prev) => ({ ...prev, [index]: raw }));
								const parsed = Number.parseFloat(raw);
								updateEntry(index, {
									amount: Number.isNaN(parsed) ? 0 : parsed,
								});
							}}
							onBlur={() =>
								setEditingAmounts((prev) => ({ ...prev, [index]: undefined }))
							}
							inputMode="decimal"
							placeholder="0.00"
							onKeyDown={(e) => {
								if (e.key === "-" || e.key === "Minus") {
									e.preventDefault();
								}
							}}
						/>
					</InputGroup>
					<IconButton
						variant="muted"
						onClick={() => onChange(entries.filter((_, i) => i !== index))}
						icon={<TrashSimpleIcon size={10} />}
						className="p-1 text-tertiary-foreground hover:text-red-500 shrink-0"
					/>
				</div>
			))}
			<IconButton
				variant="muted"
				className="text-tertiary-foreground text-xs"
				onClick={() => onChange([...entries, { currency: "", amount: 0 }])}
				icon={<PlusIcon size={10} />}
				iconOrientation="left"
			>
				{entries.length === 0
					? `Add currency (base ${baseCurrency.toUpperCase()})`
					: "Add currency"}
			</IconButton>
		</div>
	);
};
