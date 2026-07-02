import type { PriceCurrencyConfig, UsageTier } from "./usagePriceConfig.js";

export type CurrencyStripeIdSlot =
	| "stripe_price_id"
	| "stripe_empty_price_id"
	| "stripe_placeholder_price_id"
	| "stripe_prepaid_price_v2_id";

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

export const priceAmountsForCurrency = ({
	config,
	currency,
}: {
	config: CurrencyAwarePriceConfig;
	currency?: string | null;
}): Pick<PriceCurrencyConfig, "amount" | "usage_tiers"> => {
	if (!currency) {
		return { amount: config.amount, usage_tiers: config.usage_tiers };
	}
	return priceConfigForCurrency({
		config,
		currency,
		orgDefault: config.base_currency ?? currency,
	});
};

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
