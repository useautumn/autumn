import { formatAmount } from "@autumn/shared";

export const formatAmountWithCurrencyPrecision = ({
	amount,
	currency,
}: {
	amount: number;
	currency?: string | null;
}): string =>
	formatAmount({
		amount,
		currency,
		amountFormatOptions: {
			minimumFractionDigits: undefined,
			maximumFractionDigits: undefined,
		},
	});
