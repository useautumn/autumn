import {
	type FeatureOptions,
	getPrepaidDisplayQuantity,
	type ProductItem,
	type ProductV2,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";

/**
 * Selectable quantities for a volume-tiered prepaid item: the upper bound of
 * each finite tier, shifted by included usage to match the displayed quantity.
 * Empty unless the item has more than one volume-based tier, since graduated
 * tiers blend rates and have no single quantity worth snapping to.
 */
export function prepaidTierStops({
	item,
}: {
	item: Pick<ProductItem, "tiers" | "tier_behavior" | "included_usage">;
}): number[] {
	if (item.tier_behavior !== TierBehavior.VolumeBased) return [];

	const tiers = item.tiers ?? [];
	if (tiers.length < 2) return [];

	const includedUsage =
		typeof item.included_usage === "number" ? item.included_usage : 0;

	const stops = tiers
		.filter((tier) => tier.to !== TierInfinite)
		.map((tier) => (tier.to as number) + includedUsage)
		.filter((stop) => stop > includedUsage);

	return [...new Set(stops)].sort((a, b) => a - b);
}

/**
 * Bulk-converts backend option quantities to display quantities for form initialization.
 * e.g. backend quantity=1 with billing_units=1000 → display quantity=1000
 */
export function backendToDisplayQuantity({
	backendOptions,
	prepaidItems,
}: {
	backendOptions: { feature_id: string; quantity: number }[];
	prepaidItems: {
		feature_id?: string | null;
		billing_units?: number | null;
		included_usage?: number | "inf" | null;
	}[];
}): Record<string, number> {
	const backendLookup = backendOptions.reduce(
		(acc, option) => {
			acc[option.feature_id] = option.quantity;
			return acc;
		},
		{} as Record<string, number>,
	);

	return prepaidItems.reduce(
		(acc, item) => {
			if (!item.feature_id) return acc;

			const backendQuantity = backendLookup[item.feature_id] ?? 0;
			const includedUsage =
				typeof item.included_usage === "number" ? item.included_usage : 0;
			acc[item.feature_id] =
				getPrepaidDisplayQuantity({
					quantity: backendQuantity,
					billingUnits: item.billing_units,
				}) + includedUsage;
			return acc;
		},
		{} as Record<string, number>,
	);
}

/**
 * Converts a prepaid options record into a FeatureOptions array.
 * Quantities are passed through as-is (inclusive of billing units).
 */
export function convertPrepaidOptionsToFeatureOptions({
	prepaidOptions,
	product,
}: {
	prepaidOptions: Record<string, number | undefined>;
	product: ProductV2 | undefined;
}): FeatureOptions[] | undefined {
	if (!product || Object.keys(prepaidOptions).length === 0) {
		return undefined;
	}

	const options: FeatureOptions[] = [];

	for (const [featureId, quantity] of Object.entries(prepaidOptions)) {
		if (quantity === undefined) continue;
		options.push({
			feature_id: featureId,
			quantity,
		});
	}

	return options.length > 0 ? options : undefined;
}
