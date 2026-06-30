import type { PriceCurrencyConfig } from "./usagePriceConfig";

type CurrencyAmount = { currency: string; amount: number };
type CurrencyTierAmount = {
	currency: string;
	amount?: number;
	flat_amount?: number;
};
type BaseTier = { to: number | "inf"; flat_amount?: number };
type ItemTier = { additional_currencies?: CurrencyTierAmount[] | null };

const toKey = (currency: string) => currency.toLowerCase();

// Flat (fixed) price: each currency becomes a per-currency amount block.
export const buildFixedPriceCurrencies = (
	additionalCurrencies: CurrencyAmount[] | null | undefined,
): Record<string, PriceCurrencyConfig> | undefined => {
	if (!additionalCurrencies?.length) {
		return undefined;
	}

	const currencies: Record<string, PriceCurrencyConfig> = {};
	for (const { currency, amount } of additionalCurrencies) {
		currencies[toKey(currency)] = { amount };
	}
	return currencies;
};

// Usage price: each currency becomes a full usage_tiers set whose boundaries are
// copied from the base (already subtracted) tiers, so they can never drift.
// `itemTiers` drives the tiered case; `flatCurrencies` the single-tier (prepaid)
// case. Returns undefined when no currency is present, so callers omit the map.
export const buildUsagePriceCurrencies = ({
	baseTiers,
	itemTiers,
	flatCurrencies,
}: {
	baseTiers: BaseTier[];
	itemTiers?: ItemTier[] | null;
	flatCurrencies?: CurrencyAmount[] | null;
}): Record<string, PriceCurrencyConfig> | undefined => {
	if (itemTiers?.length) {
		const keys = [
			...new Set(
				itemTiers.flatMap((tier) =>
					(tier.additional_currencies ?? []).map((c) => toKey(c.currency)),
				),
			),
		];
		if (keys.length === 0) {
			return undefined;
		}

		const currencies: Record<string, PriceCurrencyConfig> = {};
		for (const key of keys) {
			currencies[key] = {
				usage_tiers: baseTiers.map((base, index) => {
					const entry = (itemTiers[index]?.additional_currencies ?? []).find(
						(c) => toKey(c.currency) === key,
					);
					return {
						to: base.to,
						amount: entry?.amount ?? 0,
						...(entry?.flat_amount !== undefined
							? { flat_amount: entry.flat_amount }
							: {}),
					};
				}),
			};
		}
		return currencies;
	}

	if (flatCurrencies?.length && baseTiers.length > 0) {
		const currencies: Record<string, PriceCurrencyConfig> = {};
		for (const { currency, amount } of flatCurrencies) {
			currencies[toKey(currency)] = {
				usage_tiers: [{ to: baseTiers[0].to, amount }],
			};
		}
		return currencies;
	}

	return undefined;
};

// --- Read-back: stored config.currencies -> API-shaped additional_currencies ---

// Fixed price: per-currency amount blocks -> flat additional_currencies.
export const fixedCurrenciesToApi = (
	currencies: Record<string, PriceCurrencyConfig> | null | undefined,
): { currency: string; amount: number }[] | undefined => {
	if (!currencies) {
		return undefined;
	}
	const entries = Object.entries(currencies);
	if (entries.length === 0) {
		return undefined;
	}
	return entries.map(([currency, block]) => ({
		currency,
		amount: block.amount ?? 0,
	}));
};

// Usage price: per-currency usage_tiers -> per-tier additional_currencies arrays,
// aligned by index to the base tiers (index i = the currencies for base tier i).
export const usageCurrenciesToTiers = (
	currencies: Record<string, PriceCurrencyConfig> | null | undefined,
	tierCount: number,
):
	| { currency: string; amount: number; flat_amount?: number }[][]
	| undefined => {
	if (!currencies || tierCount <= 0) {
		return undefined;
	}
	const entries = Object.entries(currencies);
	if (entries.length === 0) {
		return undefined;
	}

	const perTier: {
		currency: string;
		amount: number;
		flat_amount?: number;
	}[][] = Array.from({ length: tierCount }, () => []);

	for (const [currency, block] of entries) {
		(block.usage_tiers ?? []).forEach((tier, index) => {
			if (index < tierCount) {
				perTier[index].push({
					currency,
					amount: tier.amount,
					...(tier.flat_amount !== undefined
						? { flat_amount: tier.flat_amount }
						: {}),
				});
			}
		});
	}

	return perTier;
};
