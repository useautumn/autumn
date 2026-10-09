import {
	formatAmount,
	formatVolumeTierRule,
	type ProductItem,
	TierBehavior,
	TierInfinite,
	tiersToVolumeTierPricing,
} from "@autumn/shared";

export type TierRow = { range: string; value: string };

const itemToIncludedUsage = (item: ProductItem): number =>
	typeof item.included_usage === "number" ? item.included_usage : 0;

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
	if (item.tier_behavior !== TierBehavior.VolumeBased || !item.tiers?.length) {
		return undefined;
	}
	return formatVolumeTierRule({
		includedUsage: itemToIncludedUsage(item),
		pricing: tiersToVolumeTierPricing({ tiers: item.tiers }),
	});
};
