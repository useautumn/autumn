export type RateCode = {
	code: string;
	scale: number;
};

const ISO_CODE_PATTERN = /^[a-z]{3}$/;

// Stripe still bills São Tomé in the pre-2018 dobra; providers quote STN (1 STN = 1000 STD).
const REDENOMINATED_CODES: Record<string, RateCode> = {
	std: { code: "STN", scale: 1000 },
};

export class UnknownCurrencyError extends Error {
	constructor({ currency }: { currency: string }) {
		super(`Not a currency code: "${currency}"`);
		this.name = "UnknownCurrencyError";
	}
}

export const currencyToRateCode = ({
	currency,
}: {
	currency: string;
}): RateCode => {
	const key = currency.trim().toLowerCase();
	if (!ISO_CODE_PATTERN.test(key)) throw new UnknownCurrencyError({ currency });
	return REDENOMINATED_CODES[key] ?? { code: key.toUpperCase(), scale: 1 };
};
