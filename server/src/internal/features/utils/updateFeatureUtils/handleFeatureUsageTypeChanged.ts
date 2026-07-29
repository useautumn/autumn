import {
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureUsageType,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

/**
 * Re-shape entitlements and prices for a usage-type change. Blocking conditions
 * are validated upstream by detectFeatureUpdateBlockers.
 */
export const handleFeatureUsageTypeChanged = async ({
	db,
	newUsageType,
	entitlements,
	prices,
}: {
	db: DrizzleCli;
	feature: Feature;
	newUsageType: FeatureUsageType;
	linkedEntitlements: EntitlementWithFeature[];
	entitlements: EntitlementWithFeature[];
	prices: Price[];
	creditSystems: Feature[];
}) => {
	if (entitlements.length > 0 && newUsageType === FeatureUsageType.Continuous) {
		await Promise.all(
			entitlements.map((entitlement) =>
				EntitlementService.update({
					db,
					id: entitlement.id,
					updates: { interval: EntInterval.Lifetime },
				}),
			),
		);
	}

	if (prices.length > 0) {
		await Promise.all(
			prices.map((price) =>
				PriceService.update({
					db,
					id: price.id,
					update: {
						config: {
							...(price.config as UsagePriceConfig),
							should_prorate: newUsageType === FeatureUsageType.Continuous,
							stripe_price_id: null,
						},
					},
				}),
			),
		);
	}
};
