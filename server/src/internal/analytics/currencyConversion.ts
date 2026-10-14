const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type RatesCache = {
	base: string;
	multipliers: Record<string, number>;
	fetchedAt: number;
};

let ratesCache: RatesCache | null = null;

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

export const getConversionRatesJson = async ({
	baseCurrency,
}: {
	baseCurrency: string;
}): Promise<string> => {
	const multipliers = await getConversionMultipliers({ baseCurrency });
	return JSON.stringify(multipliers);
};
