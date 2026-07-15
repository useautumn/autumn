import {
	type AdditionalCurrencyPrice,
	type AdditionalCurrencyTier,
	type ProductItem,
	roundToCurrencyPrecision,
} from "@autumn/shared";
import { toast } from "sonner";

type ProductItemTier = NonNullable<ProductItem["tiers"]>[number];

const findCurrencyEntry = <T extends { currency: string }>(
	entries: T[] | null | undefined,
	code: string,
): T | undefined =>
	entries?.find((entry) => entry.currency.toLowerCase() === code);

const tierForCurrency = ({
	tier,
	code,
}: {
	tier: ProductItemTier;
	code: string;
}): ProductItemTier => {
	const entry = findCurrencyEntry(tier.additional_currencies, code);
	if (!entry) return tier;
	return {
		...tier,
		amount: entry.amount ?? tier.amount,
		flat_amount: entry.flat_amount ?? tier.flat_amount,
	};
};

export const productItemsForCurrency = ({
	items,
	currency,
	orgDefaultCurrency,
}: {
	items: ProductItem[];
	currency: string | null | undefined;
	orgDefaultCurrency: string;
}): ProductItem[] => {
	const code = currency?.toLowerCase();
	if (!code || code === orgDefaultCurrency.toLowerCase()) return items;

	return items.map((item) => {
		const priceEntry = findCurrencyEntry(item.additional_currencies, code);
		const tiers = item.tiers?.map((tier) => tierForCurrency({ tier, code }));
		return {
			...item,
			price: priceEntry?.amount ?? item.price,
			tiers: tiers ?? item.tiers,
		};
	});
};

export const unsetCurrencyCodes = (item: ProductItem): string[] => {
	const codes = new Set<string>();
	for (const entry of item.additional_currencies ?? []) {
		if (!entry.amount) codes.add(entry.currency.toUpperCase());
	}
	for (const tier of item.tiers ?? []) {
		for (const entry of tier.additional_currencies ?? []) {
			if (!entry.amount && !entry.flat_amount) {
				codes.add(entry.currency.toUpperCase());
			}
		}
	}
	return [...codes];
};

export const checkItemCurrenciesValid = (
	item: ProductItem,
	showToast = true,
) => {
	const codes = unsetCurrencyCodes(item);
	if (codes.length === 0) return true;
	if (showToast) {
		toast.error(
			`Set an amount for ${codes.join(", ")} or remove ${codes.length === 1 ? "it" : "them"} from the plan`,
		);
	}
	return false;
};

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
		codes.add(entry.currency.toLowerCase());
	}
	for (const tier of item.tiers ?? []) {
		for (const entry of tier.additional_currencies ?? []) {
			codes.add(entry.currency.toLowerCase());
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
			(entry) => entry.currency.toLowerCase() !== code.toLowerCase(),
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
			entry.currency.toLowerCase() === code.toLowerCase()
				? {
						...entry,
						[field]: Number.isNaN(parsed)
							? 0
							: roundToCurrencyPrecision(Math.max(0, parsed), code),
					}
				: entry,
		),
	};
	return { ...item, tiers };
};

export const migrateTierCurrenciesForMode = ({
	entries,
	mode,
}: {
	entries: AdditionalCurrencyTier[] | null | undefined;
	mode: "flat" | "per_unit";
}): AdditionalCurrencyTier[] | undefined =>
	entries?.map((entry) =>
		mode === "flat"
			? {
					...entry,
					flat_amount: entry.flat_amount ?? entry.amount ?? 0,
					amount: 0,
				}
			: {
					...entry,
					amount: entry.amount || entry.flat_amount || 0,
					flat_amount: undefined,
				},
	);

// The API rejects currency tiers whose flat_amount presence differs from the
// base tier, so realign entries before building request payloads.
export const alignTierCurrencyShapes = (item: ProductItem): ProductItem => {
	if (!item.tiers) return item;
	return {
		...item,
		tiers: item.tiers.map((tier) => ({
			...tier,
			additional_currencies: migrateTierCurrenciesForMode({
				entries: tier.additional_currencies,
				mode: tier.flat_amount != null ? "flat" : "per_unit",
			}),
		})),
	};
};

const cleanCurrencyEntries = <
	T extends AdditionalCurrencyPrice | AdditionalCurrencyTier,
>(
	entries: T[] | null | undefined,
): T[] | undefined => {
	const seen = new Set<string>();
	const cleaned: T[] = [];
	for (const entry of entries ?? []) {
		if (!/^[a-zA-Z]{3}$/.test(entry.currency)) continue;
		const code = entry.currency.toLowerCase();
		if (seen.has(code)) continue;
		seen.add(code);
		cleaned.push({ ...entry, currency: code });
	}
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
		additional_currencies: migrateTierCurrenciesForMode({
			entries: cleanCurrencyEntries(tier.additional_currencies)?.filter(
				(entry) => entry.currency !== orgCurrency.toLowerCase(),
			),
			mode: tier.flat_amount != null ? "flat" : "per_unit",
		}),
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
