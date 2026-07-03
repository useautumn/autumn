import type {
	AdditionalCurrencyPrice,
	AdditionalCurrencyTier,
	ProductItem,
} from "@autumn/shared";

export const stampBaseCurrency = ({
	item,
	orgCurrency,
}: {
	item: ProductItem;
	orgCurrency: string;
}): ProductItem => {
	const hasCurrencies =
		(item.additional_currencies?.length ?? 0) > 0 ||
		(item.tiers?.some(
			(tier) => (tier.additional_currencies?.length ?? 0) > 0,
		) ??
			false);

	return {
		...item,
		base_currency: hasCurrencies ? orgCurrency.toLowerCase() : undefined,
	};
};

export const itemCurrencyCodes = (item: ProductItem): string[] => {
	const codes = new Set<string>();
	for (const entry of item.additional_currencies ?? []) {
		codes.add(entry.currency);
	}
	for (const tier of item.tiers ?? []) {
		for (const entry of tier.additional_currencies ?? []) {
			codes.add(entry.currency);
		}
	}
	return [...codes];
};

export const addCurrencyToTiers = ({
	item,
	code,
}: {
	item: ProductItem;
	code: string;
}): ProductItem => ({
	...item,
	tiers: (item.tiers ?? []).map((tier) => ({
		...tier,
		additional_currencies: [
			...(tier.additional_currencies ?? []),
			{ currency: code, amount: 0 },
		],
	})),
});

export const removeCurrencyFromTiers = ({
	item,
	code,
}: {
	item: ProductItem;
	code: string;
}): ProductItem => ({
	...item,
	tiers: (item.tiers ?? []).map((tier) => ({
		...tier,
		additional_currencies: (tier.additional_currencies ?? []).filter(
			(entry) => entry.currency !== code,
		),
	})),
});

export const updateTierCurrencyAmount = ({
	item,
	tierIndex,
	code,
	field,
	value,
}: {
	item: ProductItem;
	tierIndex: number;
	code: string;
	field: "amount" | "flat_amount";
	value: string;
}): ProductItem => {
	const parsed = Number.parseFloat(value);
	const tiers = [...(item.tiers ?? [])];
	const tier = tiers[tierIndex];
	if (!tier) return item;

	tiers[tierIndex] = {
		...tier,
		additional_currencies: (tier.additional_currencies ?? []).map((entry) =>
			entry.currency === code
				? { ...entry, [field]: Number.isNaN(parsed) ? 0 : parsed }
				: entry,
		),
	};
	return { ...item, tiers };
};

const cleanCurrencyEntries = <
	T extends AdditionalCurrencyPrice | AdditionalCurrencyTier,
>(
	entries: T[] | null | undefined,
): T[] | undefined => {
	const cleaned = (entries ?? [])
		.filter((entry) => /^[a-zA-Z]{3}$/.test(entry.currency))
		.map((entry) => ({ ...entry, currency: entry.currency.toLowerCase() }));
	return cleaned.length > 0 ? cleaned : undefined;
};

export const normalizeItemCurrencies = ({
	item,
	orgCurrency,
}: {
	item: ProductItem;
	orgCurrency: string;
}): ProductItem => {
	const additionalCurrencies = cleanCurrencyEntries(
		item.additional_currencies,
	)?.filter((entry) => entry.currency !== orgCurrency.toLowerCase());

	const tiers = item.tiers?.map((tier) => ({
		...tier,
		additional_currencies: cleanCurrencyEntries(
			tier.additional_currencies,
		)?.filter((entry) => entry.currency !== orgCurrency.toLowerCase()),
	}));

	return stampBaseCurrency({
		item: {
			...item,
			additional_currencies: additionalCurrencies,
			tiers: tiers ?? item.tiers,
		},
		orgCurrency,
	});
};
