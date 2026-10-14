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
import { cn } from "@autumn/ui/lib/utils";
import { migrateTierCurrenciesForMode } from "./currencyUtils";

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

/** The header and every tier row share one grid, so their columns line up. */
export const tierGridClassName = (showsFlatFee: boolean) =>
	cn(
		"grid items-center gap-2 px-2.5",
		showsFlatFee
			? "grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_1.5rem]"
			: "grid-cols-[6rem_minmax(0,1fr)_1.5rem]",
	);

type EditorTier = PriceTier & { _uid?: string };

/** Row keys survive deletes: untagged tiers keep the index key they rendered with until a delete. */
export const tierRowKey = (tier: EditorTier, index: number) =>
	tier._uid ?? `tier-${index}`;

const withTierUids = (tiers: EditorTier[]): EditorTier[] =>
	tiers.map((tier, index) => ({ ...tier, _uid: tierRowKey(tier, index) }));

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
		// Adding to existing multi-tier setup
		const newTiers = withTierUids(item.tiers);
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
			additional_currencies: zeroedCurrencyEntries(lastTier),
			_uid: crypto.randomUUID(),
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

	const newTiers = withTierUids(item.tiers);
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
	const [{ _uid, ...onlyTier }] = newTiers;
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
