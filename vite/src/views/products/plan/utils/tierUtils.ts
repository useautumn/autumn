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

// A new tier keeps the flat-fee field its neighbour has, so Unit + Flat stays selected.
const zeroedFlatAmount = (tier: PriceTier | undefined) =>
	tier?.flat_amount != null ? { flat_amount: 0 } : {};

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
					...zeroedFlatAmount(firstTier),
					additional_currencies: zeroedCurrencyEntries(firstTier),
				}, // Second tier is infinite
			],
		});
	} else {
		// Adding to existing multi-tier setup
		const newTiers = [...item.tiers];
		const lastTier = newTiers[newTiers.length - 1];

		// Set previous last tier to a default value if it was infinite
		if (lastTier.to === Infinite) {
			const prevTierTo = newTiers[newTiers.length - 2]?.to;
			lastTier.to = (typeof prevTierTo === "number" ? prevTierTo : 0) + 100;
		}

		// Add new infinite tier
		newTiers.push({
			to: Infinite,
			amount: 0,
			...zeroedFlatAmount(lastTier),
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
		// If removing the last tier, switch to included usage mode
		setItem({ ...item, tiers: null });
		return;
	}

	const newTiers = [...item.tiers];
	newTiers.splice(index, 1);

	// Ensure last tier is always infinite
	if (newTiers.length > 0) {
		newTiers[newTiers.length - 1].to = Infinite;
	}

	const remaining = { ...item, tiers: newTiers };
	if (newTiers.length > 1) {
		setItem(remaining);
		return;
	}

	// One tier saves as a plain `price.amount` with no tier behaviour or flat fee,
	// so drop both rather than show volume pricing that won't save.
	setItem({
		...itemToVolumePricingMode({ item: remaining, mode: "per_unit" }),
		tier_behavior: undefined,
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
		// Don't allow updating the last tier's "to" value - it must always be Infinite
		if (index === newTiers.length - 1) {
			return;
		}

		// Handle empty string, infinity, or numeric values
		let numValue: number | typeof Infinite;
		if (value === "" || value === "∞") {
			numValue = value === "" ? 0 : Infinite;
		} else {
			const parsed = parseFloat(value);
			numValue = Number.isNaN(parsed) ? 0 : parsed;
		}
		newTiers[index] = { ...newTiers[index], to: numValue };

		// Update next tier's "to" to match, but ensure last tier stays Infinite
		if (newTiers[index + 1]) {
			if (index + 1 === newTiers.length - 1) {
				// If next tier is the last tier, keep it as Infinite
				newTiers[index + 1].to = Infinite;
			} else {
				newTiers[index + 1].to = numValue;
			}
		}
	} else if (field === "amount" || field === "flat_amount") {
		// Handle empty string or numeric values
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

export type VolumePricingMode = "flat" | "per_unit" | "per_unit_and_flat";

/** Reads the mode from tier data, so mixed tiers from the API keep both amounts. */
/** The base price and every additional-currency price a tier carries. */
const tierToPriceEntries = (
	tier: PriceTier,
): { amount?: number | null; flat_amount?: number | null }[] => [
	tier,
	...(tier.additional_currencies ?? []),
];

export const tiersToVolumePricingMode = ({
	tiers,
}: {
	tiers: PriceTier[] | null | undefined;
}): VolumePricingMode => {
	const entries = (tiers ?? []).flatMap(tierToPriceEntries);
	const hasUnitAmounts = entries.some((entry) => (entry.amount ?? 0) !== 0);
	const hasFlatAmounts = entries.some((entry) => entry.flat_amount != null);
	const hasFlatFee = entries.some((entry) => (entry.flat_amount ?? 0) > 0);

	if (hasUnitAmounts && hasFlatFee) return "per_unit_and_flat";
	if (hasFlatAmounts && !hasUnitAmounts) return "flat";
	return "per_unit";
};

/** Whether the tiers still hold the shape `mode` edits, so a stale toggle can't hide a price. */
export const volumePricingModeFitsTiers = ({
	mode,
	tiers,
}: {
	mode: VolumePricingMode;
	tiers: PriceTier[] | null | undefined;
}): boolean => {
	if (!tiers) return false;
	const entries = tiers.flatMap(tierToPriceEntries);
	if (mode === "flat") {
		return entries.every((entry) => (entry.amount ?? 0) === 0);
	}
	if (mode === "per_unit") {
		return entries.every((entry) => entry.flat_amount == null);
	}
	// Currency flat fees are aligned to the base tier on save, so the base decides.
	return tiers.every((tier) => tier.flat_amount != null);
};

/** Moves each tier's price into the fields `mode` edits; 0 and unset flat fees bill alike. */
export const itemToVolumePricingMode = ({
	item,
	mode,
}: {
	item: ProductItem;
	mode: VolumePricingMode;
}): ProductItem => {
	if (!item.tiers) return item;

	const tiers = item.tiers.map((tier): PriceTier => {
		const additional_currencies = migrateTierCurrenciesForMode({
			entries: tier.additional_currencies,
			mode,
		});
		if (mode === "flat") {
			return {
				...tier,
				flat_amount: tier.flat_amount ?? tier.amount,
				amount: 0,
				additional_currencies,
			};
		}
		if (mode === "per_unit") {
			return {
				...tier,
				amount: tier.amount !== 0 ? tier.amount : (tier.flat_amount ?? 0),
				flat_amount: undefined,
				additional_currencies,
			};
		}
		return {
			...tier,
			flat_amount: tier.flat_amount ?? 0,
			additional_currencies,
		};
	});

	return { ...item, tiers };
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
