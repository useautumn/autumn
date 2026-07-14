import {
	type AdditionalCurrencyPrice,
	roundToCurrencyPrecision,
} from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import { CurrencyAmountInput } from "./CurrencyAmountInput";
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

	const updateAmount = (index: number, raw: string) => {
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

	return (
		<div className="space-y-2">
			{entries.map((entry, index) => (
				<div
					className="flex items-center gap-2"
					key={`currency-${
						// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, codes are picked once
						index
					}`}
				>
					<CurrencyAmountInput
						currencyCode={entry.currency}
						displayValue={entry.amount === 0 ? "" : entry.amount.toString()}
						onRawChange={(raw) => updateAmount(index, raw)}
					/>
					<IconButton
						className="shrink-0 p-1 text-tertiary-foreground hover:text-red-500"
						icon={<TrashIcon size={10} />}
						onClick={() => onChange(entries.filter((_, i) => i !== index))}
						variant="muted"
					/>
				</div>
			))}
			<CurrencyPicker
				className="w-full"
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
