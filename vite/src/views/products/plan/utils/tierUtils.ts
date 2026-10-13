import {
	formatAmount,
	formatVolumeTierRule,
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
	TierInfinite,
	tiersToVolumeTierPricing,
} from "@autumn/shared";
import {
	migrateTierCurrenciesForMode,
	tierChargesFlatFee,
	updateTierCurrencyAmount,
} from "./currencyUtils";
import {
	type EditorTier,
	newTierUid,
	stripTierUids,
	withTierUids,
} from "./tierUids";

export const itemToIncludedUsage = (item: ProductItem): number =>
	typeof item.included_usage === "number" ? item.included_usage : 0;

export const tierToDisplay = ({
	tier,
	includedUsage,
}: {
	tier: PriceTier | undefined;
	includedUsage: number;
}): string => {
	if (!tier) return "0";
	if (tier.to === Infinite) return "∞";
	return (
		(typeof tier.to === "number" ? tier.to : 0) + includedUsage
	).toString();
};

const zeroedCurrencyEntries = (tier: PriceTier | undefined) =>
	tier?.additional_currencies?.length
		? tier.additional_currencies.map((entry) => ({
				currency: entry.currency,
				amount: 0,
			}))
		: undefined;

export const addTier = ({
	item,
	setItem,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
}) => {
	if (!item) return;

	if (!item.tiers || item.tiers.length === 0) {
		// First tier should be infinite for single tier pricing
		setItem({ ...item, tiers: [{ to: Infinite, amount: 0 }] });
	} else if (item.tiers.length === 1) {
		// Converting from single tier to multi-tier
		const firstTier = item.tiers[0];
		setItem({
			...item,
			tiers: [
				{ ...firstTier, to: 100 }, // First tier with default limit
				{
					to: Infinite,
					amount: 0,
					additional_currencies: zeroedCurrencyEntries(firstTier),
				}, // Second tier is infinite
			],
		});
	} else {
		// The old last tier gets a bound 100 past the one before it.
		const tiers = withTierUids(item).tiers ?? [];
		const lastTier = tiers[tiers.length - 1];
		const prevTierTo = tiers[tiers.length - 2]?.to;
		const boundedLastTier =
			lastTier.to === Infinite
				? {
						...lastTier,
						to: (typeof prevTierTo === "number" ? prevTierTo : 0) + 100,
					}
				: lastTier;
		const newTier: EditorTier = {
			to: Infinite,
			amount: 0,
			additional_currencies: zeroedCurrencyEntries(lastTier),
			_uid: newTierUid(),
		};
		setItem({
			...item,
			tiers: [...tiers.slice(0, -1), boundedLastTier, newTier],
		});
	}
};

export const removeTier = ({
	item,
	setItem,
	index,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
	index: number;
}) => {
	if (!item.tiers || item.tiers.length <= 1) {
		// If removing the last tier, switch to included usage mode
		setItem({ ...item, tiers: null });
		return;
	}

	// The last remaining tier is always unbounded.
	const kept = (withTierUids(item).tiers ?? []).filter((_, i) => i !== index);
	const newTiers = kept.map(
		(tier, i): EditorTier =>
			i === kept.length - 1 ? { ...tier, to: Infinite } : tier,
	);

	const remaining = { ...item, tiers: newTiers };
	if (newTiers.length > 1) {
		setItem(remaining);
		return;
	}

	// One tier saves as a plain `price.amount` with no tier behaviour or flat fee,
	// so drop both rather than show volume pricing that won't save.
	const [onlyTier] = stripTierUids(newTiers);
	setItem({
		...remaining,
		tier_behavior: undefined,
		tiers: [
			{
				...onlyTier,
				amount: onlyTier.amount || (onlyTier.flat_amount ?? 0),
				flat_amount: undefined,
				additional_currencies: migrateTierCurrenciesForMode({
					entries: onlyTier.additional_currencies,
					mode: "per_unit",
				}),
			},
		],
	});
};

/** Display `to` includes included usage; stored `to` does not. */
export const applyTierToDisplayValue = ({
	item,
	index,
	displayValue,
}: {
	item: ProductItem;
	index: number;
	displayValue: string;
}): ProductItem => {
	if (!item.tiers) return item;
	if (index === item.tiers.length - 1) return item;

	const parsed = parseFloat(displayValue);
	if (Number.isNaN(parsed)) return item;

	const includedUsage = itemToIncludedUsage(item);
	const internalTo = parsed - includedUsage;
	if (item.tiers[index]?.to === internalTo) return item;

	return mapTier({ item, index, fn: (tier) => ({ ...tier, to: internalTo }) });
};

const parseAmount = (value: string) => {
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? 0 : parsed;
};

/** A tier keeps a base flat fee whenever any currency charges one, so the save can't strip it. */
const withFlatFeePresence = (tier: PriceTier): PriceTier => ({
	...tier,
	flat_amount: tierChargesFlatFee(tier) ? (tier.flat_amount ?? 0) : undefined,
});

const mapTier = ({
	item,
	index,
	fn,
}: {
	item: ProductItem;
	index: number;
	fn: (tier: PriceTier) => PriceTier;
}): ProductItem => ({
	...item,
	tiers: item.tiers?.map((tier, i) => (i === index ? fn(tier) : tier)),
});

/** Writes one price cell; `currency` is the tab being edited, base when it matches the org's. */
export const updateTierPrice = ({
	item,
	index,
	currency,
	baseCurrency,
	field,
	value,
}: {
	item: ProductItem;
	index: number;
	currency: string;
	baseCurrency: string;
	field: "amount" | "flat_amount";
	value: string;
}): ProductItem => {
	if (!item.tiers?.[index]) return item;

	const isBaseCurrency = currency.toLowerCase() === baseCurrency.toLowerCase();
	const edited = isBaseCurrency
		? mapTier({
				item,
				index,
				fn: (tier) => ({ ...tier, [field]: parseAmount(value) }),
			})
		: updateTierCurrencyAmount({
				item,
				tierIndex: index,
				code: currency,
				field,
				value,
			});
	if (field === "amount") return edited;
	return mapTier({ item: edited, index, fn: withFlatFeePresence });
};

/** Graduated pricing has no flat fees, so switching to it drops them. */
export const itemToTierBehavior = ({
	item,
	tierBehavior,
}: {
	item: ProductItem;
	tierBehavior: TierBehavior;
}): ProductItem => {
	if (tierBehavior === TierBehavior.VolumeBased || !item.tiers) {
		return { ...item, tier_behavior: tierBehavior };
	}
	return {
		...item,
		tier_behavior: tierBehavior,
		tiers: item.tiers.map((tier) => ({
			...tier,
			flat_amount: undefined,
			additional_currencies: migrateTierCurrenciesForMode({
				entries: tier.additional_currencies,
				mode: "per_unit",
			}),
		})),
	};
};

export type TierRow = { range: string; value: string };

/** Tier rows in total-usage positions, matching the editor's boundaries. */
export const itemToTierRows = ({
	item,
	currency,
}: {
	item: ProductItem;
	currency: string;
}): TierRow[] => {
	// Stored tier `to` excludes the included usage, so add it back.
	const includedUsage = itemToIncludedUsage(item);
	const format = (amount: number) =>
		formatAmount({
			currency,
			amount,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});

	// Volume also charges the included units once usage passes them.
	const isVolume = item.tier_behavior === TierBehavior.VolumeBased;
	const rows: TierRow[] = [];
	if (includedUsage > 0) {
		rows.push({
			range: `0–${includedUsage}`,
			value: isVolume ? "Free until exceeded" : "Included",
		});
	}

	let from = includedUsage;
	for (const tier of item.tiers ?? []) {
		const isInfinite = tier.to === TierInfinite;
		const to = typeof tier.to === "number" ? tier.to + includedUsage : tier.to;
		const range = isInfinite ? `${from}+` : `${from}–${to}`;
		if (!isInfinite && typeof to === "number") from = to;

		const parts: string[] = [];
		if (tier.amount) parts.push(format(tier.amount));
		if (tier.flat_amount) parts.push(`${format(tier.flat_amount)} flat`);

		rows.push({ range, value: parts.length > 0 ? parts.join(" + ") : "Free" });
	}

	return rows;
};

export const itemToVolumeTierRule = ({
	item,
}: {
	item: ProductItem;
}): string | undefined => {
	const includedUsage = itemToIncludedUsage(item);
	const isVolume = item.tier_behavior === TierBehavior.VolumeBased;
	const hasMultipleTiers = (item.tiers?.length ?? 0) > 1;
	const showsRule = isVolume && (hasMultipleTiers || includedUsage > 0);
	if (!showsRule || !item.tiers?.length) return undefined;

	return formatVolumeTierRule({
		includedUsage,
		pricing: tiersToVolumeTierPricing({ tiers: item.tiers }),
	});
};
