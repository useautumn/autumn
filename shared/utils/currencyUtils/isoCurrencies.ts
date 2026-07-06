// Single source of truth for currency-code validation and per-currency
// precision, shared by the API schemas (server) and the plan editor (frontend).
// Backed by the runtime ICU tables, which both Bun and modern browsers expose.

// `Intl.supportedValuesOf` predates the TS lib version this repo targets.
const intlWithSupportedValues = Intl as typeof Intl & {
	supportedValuesOf?: (key: "currency") => string[];
};

const ISO_CODES: readonly string[] =
	typeof intlWithSupportedValues.supportedValuesOf === "function"
		? intlWithSupportedValues.supportedValuesOf("currency")
		: ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];

const ISO_CODE_SET = new Set(ISO_CODES.map((code) => code.toLowerCase()));

// Lowercase codes, sorted for stable dropdown ordering.
export const CURRENCY_CODES: readonly string[] = [...ISO_CODE_SET].sort();

export const isValidCurrencyCode = (code: string | null | undefined): boolean =>
	!!code && ISO_CODE_SET.has(code.toLowerCase());

const DECIMALS_CACHE = new Map<string, number>();

// Minor-unit count for a currency (2 for USD/EUR, 0 for JPY, 3 for BHD).
// Falls back to 2 for unknown codes.
export const currencyDecimalPlaces = (
	code: string | null | undefined,
): number => {
	if (!isValidCurrencyCode(code)) {
		return 2;
	}
	const key = (code as string).toUpperCase();
	const cached = DECIMALS_CACHE.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const digits =
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: key,
		}).resolvedOptions().maximumFractionDigits ?? 2;
	DECIMALS_CACHE.set(key, digits);
	return digits;
};

// Round an amount to the currency's minor units, avoiding float drift.
export const roundToCurrencyPrecision = (
	amount: number,
	code: string | null | undefined,
): number => {
	const factor = 10 ** currencyDecimalPlaces(code);
	return Math.round(amount * factor) / factor;
};

const DISPLAY_NAMES =
	typeof Intl.DisplayNames === "function"
		? new Intl.DisplayNames(["en"], { type: "currency" })
		: null;

export const currencyDisplayName = (code: string): string => {
	try {
		return DISPLAY_NAMES?.of(code.toUpperCase()) ?? code.toUpperCase();
	} catch {
		return code.toUpperCase();
	}
};
