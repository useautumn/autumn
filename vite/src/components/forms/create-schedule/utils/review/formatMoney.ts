import { formatAmount } from "@autumn/shared";

const CENTS_FRACTION_DIGITS = 2;

export const formatMoney = ({
	amount,
	currency,
	showCents = false,
}: {
	amount: number;
	currency: string;
	showCents?: boolean;
}) =>
	formatAmount({
		amount,
		currency,
		...(showCents && {
			minFractionDigits: CENTS_FRACTION_DIGITS,
			maxFractionDigits: CENTS_FRACTION_DIGITS,
		}),
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
