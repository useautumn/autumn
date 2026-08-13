import type { AdditionalCurrencyPrice, ProductItem } from "@autumn/shared";

export const getItemAdditionalCurrencies = (
	item: ProductItem,
): AdditionalCurrencyPrice[] => {
	const entries =
		item.additional_currencies ??
		(item.tiers?.length === 1
			? item.tiers[0].additional_currencies
			: undefined);

	return (entries ?? []).flatMap((entry) =>
		entry.amount == null
			? []
			: [{ currency: entry.currency, amount: entry.amount }],
	);
};
