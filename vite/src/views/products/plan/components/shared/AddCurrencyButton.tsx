import { CurrencyPicker } from "./CurrencyPicker";

export const AddCurrencyButton = ({
	baseCurrency,
	currencyCodes,
	onSelect,
}: {
	baseCurrency: string;
	currencyCodes: string[];
	onSelect: (code: string) => void;
}) => (
	<CurrencyPicker
		className="w-full"
		excludedCodes={[baseCurrency, ...currencyCodes]}
		label={
			currencyCodes.length === 0
				? `Add currency (base ${baseCurrency.toUpperCase()})`
				: "Add currency"
		}
		onSelect={onSelect}
	/>
);
