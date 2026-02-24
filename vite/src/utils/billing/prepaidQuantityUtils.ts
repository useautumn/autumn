import {
	type FeatureOptions,
	getPrepaidDisplayQuantity,
	type ProductV2,
} from "@autumn/shared";

/**
 * Bulk-converts backend option quantities to display quantities for form initialization.
 * e.g. backend quantity=1 with billing_units=1000 → display quantity=1000
 */
export function backendToDisplayQuantity({
	backendOptions,
	prepaidItems,
}: {
	backendOptions: { feature_id: string; quantity: number }[];
	prepaidItems: { feature_id?: string | null; billing_units?: number | null }[];
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
			acc[item.feature_id] = getPrepaidDisplayQuantity({
				quantity: backendQuantity,
				billingUnits: item.billing_units,
			});
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
	prepaidOptions: Record<string, number>;
	product: ProductV2 | undefined;
}): FeatureOptions[] | undefined {
	if (!product || Object.keys(prepaidOptions).length === 0) {
		return undefined;
	}

	const options: FeatureOptions[] = [];

	for (const [featureId, quantity] of Object.entries(prepaidOptions)) {
		options.push({
			feature_id: featureId,
			quantity: quantity || 0,
		});
	}

	return options.length > 0 ? options : undefined;
}
