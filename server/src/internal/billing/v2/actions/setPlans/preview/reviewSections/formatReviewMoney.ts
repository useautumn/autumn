import { formatAmount } from "@autumn/shared";

const CENTS_FRACTION_DIGITS = 2;
const REVIEW_LOCALE = "en-US";

/** "$50", or "$13.33" with `showCents`; the narrow symbol keeps "US$" out of the value column. */
export const formatReviewMoney = ({
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
		locale: REVIEW_LOCALE,
	});
