/**
 * Currency conversion using the Frankfurter API (ECB rates).
 * Rates are cached in memory for 24 hours.
 *
 * Primary use: build a JSON multiplier map that ClickHouse can use inline
 * to convert amounts: `i.total * JSONExtractFloat({rates:String}, lower(i.currency))`
 * where rates = { "usd": 1, "eur": 0.87, "clp": 956.2, ... } relative to the base.
 *
 * The map stores "1 base = X foreign", so to convert foreign→base we divide.
 * For ClickHouse we store the inverse (base/foreign) so it can just multiply.
 */

const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type RatesCache = {
	base: string;
	/** Multipliers: multiply a foreign amount by this to get the base amount */
	multipliers: Record<string, number>;
	fetchedAt: number;
};

let ratesCache: RatesCache | null = null;

/**
 * Get conversion multipliers for a target base currency.
 * Returns a map where each key is a lowercase currency code and
 * the value is what you multiply an amount in that currency by
 * to get the equivalent in the base currency.
 * The base currency itself has multiplier 1.
 */
export const getConversionMultipliers = async ({
	baseCurrency,
}: {
	baseCurrency: string;
}): Promise<Record<string, number>> => {
	const base = baseCurrency.toUpperCase();
	const now = Date.now();

	if (
		ratesCache &&
		ratesCache.base === base &&
		now - ratesCache.fetchedAt < CACHE_TTL_MS
	) {
		return ratesCache.multipliers;
	}

	const multipliers: Record<string, number> = {
		[base.toLowerCase()]: 1,
	};

	try {
		const res = await fetch(`${FRANKFURTER_BASE_URL}/latest?base=${base}`);

		if (res.ok) {
			const data = (await res.json()) as {
				base: string;
				rates: Record<string, number>;
			};

			// Frankfurter returns: 1 BASE = X FOREIGN
			// We need: amount_in_FOREIGN * multiplier = amount_in_BASE
			// So multiplier = 1 / X
			for (const [currency, rate] of Object.entries(data.rates)) {
				multipliers[currency.toLowerCase()] = 1 / rate;
			}
		} else {
			console.warn(
				`[CurrencyConversion] Frankfurter API returned ${res.status} for base=${base}`,
			);
		}
	} catch (err) {
		console.warn("[CurrencyConversion] Failed to fetch rates:", err);
	}

	ratesCache = { base, multipliers, fetchedAt: now };
	return multipliers;
};

/**
 * Get the multipliers as a JSON string for use as a ClickHouse query param.
 * Usage in SQL: `i.total * JSONExtractFloat({rates:String}, lower(i.currency))`
 * Unsupported currencies will return 0 from JSONExtractFloat (amount excluded).
 */
export const getConversionRatesJson = async ({
	baseCurrency,
}: {
	baseCurrency: string;
}): Promise<string> => {
	const multipliers = await getConversionMultipliers({ baseCurrency });
	return JSON.stringify(multipliers);
};
