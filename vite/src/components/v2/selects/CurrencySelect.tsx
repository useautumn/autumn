import { cn } from "@/lib/utils";
import { stripeCurrencyCodes } from "@/utils/constants/stripeCurrencyCodes";
import { SearchableSelect } from "@autumn/ui";

export const CurrencySelect = ({
	defaultCurrency,
	setDefaultCurrency,
	className,
	disabled,
}: {
	defaultCurrency: string;
	setDefaultCurrency: (currency: string) => void;
	className?: string;
	disabled?: boolean;
}) => {
	return (
		<SearchableSelect
			value={defaultCurrency}
			onValueChange={(value) => setDefaultCurrency(value.toUpperCase())}
			options={stripeCurrencyCodes}
			getOptionValue={(currency) => currency.code}
			getOptionLabel={(currency) => `${currency.currency} - ${currency.code}`}
			searchable
			searchPlaceholder="Search currency..."
			placeholder="Select currency..."
			emptyText="No currency found."
			disabled={disabled}
			triggerClassName={cn("w-full", className)}
		/>
	);
};
