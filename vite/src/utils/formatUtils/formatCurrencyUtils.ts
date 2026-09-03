import { formatAmount } from "@autumn/shared";

/**
 * Currency formatting that leaves the fraction digits to Intl, so each
 * currency keeps its own precision: $1,500.00, but ¥1,850.
 */
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
