import {
	type AdditionalCurrencyPrice,
	roundToCurrencyPrecision,
} from "@autumn/shared";
import { FormLabel, IconButton } from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import { AddCurrencyButton } from "./AddCurrencyButton";
import { amountDisplayValue, CurrencyAmountInput } from "./CurrencyAmountInput";

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
		<div>
			<FormLabel>Additional currencies</FormLabel>
			<div className="space-y-2">
				{entries.map((entry, index) => (
					<div className="flex items-center gap-2" key={`currency-${index}`}>
						<CurrencyAmountInput
							currencyCode={entry.currency}
							displayValue={amountDisplayValue(entry.amount)}
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
				<AddCurrencyButton
					baseCurrency={baseCurrency}
					currencyCodes={entries.map((entry) => entry.currency)}
					onSelect={(code) =>
						onChange([...entries, { currency: code, amount: 0 }])
					}
				/>
			</div>
		</div>
	);
};
