import type { AdditionalCurrencyPrice, ProductItem } from "@autumn/shared";

export const getItemAdditionalCurrencies = (
	item: ProductItem,
): AdditionalCurrencyPrice[] => {
	const currencies = new Map<string, AdditionalCurrencyPrice>();
	const entries = [
		...(item.additional_currencies ?? []),
		...(item.tiers ?? []).flatMap((tier) => tier.additional_currencies ?? []),
	];

	for (const entry of entries) {
		const code = entry.currency.toLowerCase();
		if (entry.amount != null && !currencies.has(code)) {
			currencies.set(code, { currency: entry.currency, amount: entry.amount });
		}
	}

	return [...currencies.values()];
};
