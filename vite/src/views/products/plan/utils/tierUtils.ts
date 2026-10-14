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
import { migrateTierCurrenciesForMode } from "./currencyUtils";

const itemToIncludedUsage = (item: ProductItem): number =>
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
		setItem({ ...item, tiers: [{ to: Infinite, amount: 0 }] });
	} else if (item.tiers.length === 1) {
		const firstTier = item.tiers[0];
		setItem({
			...item,
			tiers: [
				{ ...firstTier, to: 100 },
				{
					to: Infinite,
					amount: 0,
					additional_currencies: zeroedCurrencyEntries(firstTier),
				},
			],
		});
	} else {
		const newTiers = [...item.tiers];
		const lastTier = newTiers[newTiers.length - 1];

		if (lastTier.to === Infinite) {
			const prevTierTo = newTiers[newTiers.length - 2]?.to;
			lastTier.to = (typeof prevTierTo === "number" ? prevTierTo : 0) + 100;
		}

		newTiers.push({
			to: Infinite,
			amount: 0,
			additional_currencies: zeroedCurrencyEntries(lastTier),
		});
		setItem({ ...item, tiers: newTiers });
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
		setItem({ ...item, tiers: null });
		return;
	}

	const newTiers = [...item.tiers];
	newTiers.splice(index, 1);

	if (newTiers.length > 0) {
		newTiers[newTiers.length - 1].to = Infinite;
	}

	const remaining = { ...item, tiers: newTiers };
	if (newTiers.length > 1) {
		setItem(remaining);
		return;
	}

	const [onlyTier] = newTiers;
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

	const newTiers = [...item.tiers];
	newTiers[index] = { ...newTiers[index], to: internalTo };
	return { ...item, tiers: newTiers };
};

export const updateTier = ({
	item,
	setItem,
	index,
	field,
	value,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
	index: number;
	field: "to" | "amount" | "flat_amount";
	value: string;
}) => {
	if (!item.tiers) return;

	const newTiers = [...item.tiers];
	if (field === "to") {
		if (index === newTiers.length - 1) {
			return;
		}

		let numValue: number | typeof Infinite;
		if (value === "" || value === "∞") {
			numValue = value === "" ? 0 : Infinite;
		} else {
			const parsed = parseFloat(value);
			numValue = Number.isNaN(parsed) ? 0 : parsed;
		}
		newTiers[index] = { ...newTiers[index], to: numValue };

		if (newTiers[index + 1]) {
			if (index + 1 === newTiers.length - 1) {
				newTiers[index + 1].to = Infinite;
			} else {
				newTiers[index + 1].to = numValue;
			}
		}
	} else if (field === "amount" || field === "flat_amount") {
		let numValue: number;
		if (value === "") {
			numValue = 0;
		} else {
			const parsed = parseFloat(value);
			numValue = Number.isNaN(parsed) ? 0 : parsed;
		}
		newTiers[index] = { ...newTiers[index], [field]: numValue };
	}
	setItem({ ...item, tiers: newTiers });
};

export type VolumePricingMode = "flat" | "per_unit";

export const itemToVolumePricingModeOnOpen = ({
	item,
}: {
	item: ProductItem | null | undefined;
}): VolumePricingMode => {
	const tiers = item?.tiers ?? [];
	if (item?.tier_behavior !== TierBehavior.VolumeBased) return "per_unit";

	const hasNoUnitRates = tiers.every((tier) => !tier.amount);
	const hasFlatField = tiers.some((tier) => tier.flat_amount != null);
	if (hasNoUnitRates && hasFlatField) return "flat";
	return "per_unit";
};

export type TierRow = { range: string; value: string };

export const itemToTierRows = ({
	item,
	currency,
}: {
	item: ProductItem;
	currency: string;
}): TierRow[] => {
	const includedUsage = itemToIncludedUsage(item);
	const format = (amount: number) =>
		formatAmount({
			currency,
			amount,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});

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
