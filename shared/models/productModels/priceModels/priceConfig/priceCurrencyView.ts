import type { PriceCurrencyConfig, UsageTier } from "./usagePriceConfig.js";

export type CurrencyStripeIdSlot =
	| "stripe_price_id"
	| "stripe_empty_price_id"
	| "stripe_placeholder_price_id"
	| "stripe_prepaid_price_v2_id";

// The subset of a fixed/usage price config the per-currency view reads or mutates.
// The base currency lives in the top-level fields; additional currencies live in
// `currencies[ccy]`. Product / meter / event ids are shared and stay top-level only.
export type CurrencyAwarePriceConfig = {
	amount?: number | null;
	usage_tiers?: UsageTier[] | null;
	base_currency?: string | null;
	currencies?: Record<string, PriceCurrencyConfig> | null;
} & Partial<Record<CurrencyStripeIdSlot, string | null>>;

const resolveBaseCurrency = ({
	config,
	orgDefault,
}: {
	config: CurrencyAwarePriceConfig;
	orgDefault: string;
}): string => (config.base_currency ?? orgDefault).toLowerCase();

export const isBaseCurrency = ({
	config,
	currency,
	orgDefault,
}: {
	config: CurrencyAwarePriceConfig;
	currency: string;
	orgDefault: string;
}): boolean =>
	currency.toLowerCase() === resolveBaseCurrency({ config, orgDefault });

/** The amount / usage_tiers to bill for `currency`: base config, or the per-currency override block. */
export const priceConfigForCurrency = ({
	config,
	currency,
	orgDefault,
}: {
	config: CurrencyAwarePriceConfig;
	currency: string;
	orgDefault: string;
}): Pick<PriceCurrencyConfig, "amount" | "usage_tiers"> => {
	if (isBaseCurrency({ config, currency, orgDefault })) {
		return { amount: config.amount, usage_tiers: config.usage_tiers };
	}
	const block = config.currencies?.[currency.toLowerCase()];
	return { amount: block?.amount, usage_tiers: block?.usage_tiers };
};

/** Whether billable amounts exist for `currency`: always true for base; for others the
 *  block must carry a real amount (fixed) or non-empty usage_tiers — an ID-only block doesn't count. */
export const priceHasCurrencyAmounts = ({
	config,
	currency,
	orgDefault,
	isFixed,
}: {
	config: CurrencyAwarePriceConfig;
	currency: string;
	orgDefault: string;
	isFixed: boolean;
}): boolean => {
	if (isBaseCurrency({ config, currency, orgDefault })) return true;
	const block = config.currencies?.[currency.toLowerCase()];
	if (!block) return false;
	return isFixed ? block.amount != null : !!block.usage_tiers?.length;
};

/** Reads a Stripe id slot for `currency`: top-level for the base currency, else the per-currency block. */
export const getPriceCurrencyStripeId = ({
	config,
	currency,
	orgDefault,
	slot,
}: {
	config: CurrencyAwarePriceConfig;
	currency: string;
	orgDefault: string;
	slot: CurrencyStripeIdSlot;
}): string | undefined => {
	if (isBaseCurrency({ config, currency, orgDefault })) {
		return config[slot] ?? undefined;
	}
	return config.currencies?.[currency.toLowerCase()]?.[slot] ?? undefined;
};

/** Writes a Stripe id slot for `currency` (mutates `config`): top-level for base, else the per-currency block.
 *  A nullish id clears the slot; on a non-base currency with no existing block it is a no-op (no empty block). */
export const setPriceCurrencyStripeId = ({
	config,
	currency,
	orgDefault,
	slot,
	id,
}: {
	config: CurrencyAwarePriceConfig;
	currency: string;
	orgDefault: string;
	slot: CurrencyStripeIdSlot;
	id: string | null | undefined;
}): void => {
	if (isBaseCurrency({ config, currency, orgDefault })) {
		config[slot] = id ?? undefined;
		return;
	}
	const ccy = currency.toLowerCase();
	const existing = config.currencies?.[ccy];
	if (id == null && !existing) return;
	const currencies = { ...config.currencies };
	currencies[ccy] = { ...existing, [slot]: id ?? undefined };
	config.currencies = currencies;
};
