import {
	EntInterval,
	type EntitlementWithFeature,
	ErrCode,
	type Feature,
	FeatureUsageType,
	keyToTitle,
	type Price,
	RecaseError,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

export const handleFeatureUsageTypeChanged = async ({
	db,
	feature,
	newUsageType,
	linkedEntitlements,
	entitlements,
	prices,
	creditSystems,
}: {
	db: DrizzleCli;
	feature: Feature;
	newUsageType: FeatureUsageType;
	linkedEntitlements: EntitlementWithFeature[];
	entitlements: EntitlementWithFeature[];
	prices: Price[];
	creditSystems: Feature[];
}) => {
	const usageTypeTitle = keyToTitle(newUsageType).toLowerCase();
	if (creditSystems.length > 0) {
		throw new RecaseError({
			message: `Cannot set to ${usageTypeTitle} because it is used in credit system ${creditSystems[0].id}`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (linkedEntitlements.length > 0) {
		throw new RecaseError({
			message: `Cannot set to ${usageTypeTitle} because it is used as an entity by ${linkedEntitlements[0].feature.name}`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	// Get cus product using feature...
	const cusEnts = await CusEntService.getByFeature({
		db,
		internalFeatureId: feature.internal_id,
	});

	if (cusEnts && cusEnts.length > 0) {
		throw new RecaseError({
			message: `Cannot set to ${usageTypeTitle} because it is / was used by customers`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (entitlements.length > 0) {
		console.log(
			`Feature usage type changed to ${newUsageType}, updating entitlements and prices`,
		);
		if (newUsageType === FeatureUsageType.Continuous) {
			const batchEntUpdate = [];
			for (const entitlement of entitlements) {
				batchEntUpdate.push(
					EntitlementService.update({
						db,
						id: entitlement.id,
						updates: {
							interval: EntInterval.Lifetime,
						},
					}),
				);
			}

			await Promise.all(batchEntUpdate);
			console.log(`Updated ${entitlements.length} entitlements`);
		}
	}

	if (prices.length > 0) {
		const batchPriceUpdate = [];
		for (const price of prices) {
			const priceConfig = price.config as UsagePriceConfig;

			batchPriceUpdate.push(
				PriceService.update({
					db,
					id: price.id,
					update: {
						config: {
							...priceConfig,
							should_prorate: newUsageType === FeatureUsageType.Continuous,
							stripe_price_id: null,
						},
					},
				}),
			);
		}

		await Promise.all(batchPriceUpdate);
		console.log(`Updated ${prices.length} prices`);
	}
};
