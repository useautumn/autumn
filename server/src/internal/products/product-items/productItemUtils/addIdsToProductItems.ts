import {
	BillingType,
	type EntInterval,
	type EntitlementWithFeature,
	entIntervalToValue,
	entToPrice,
	getBillingType,
	isFixedPrice,
	itemToEntInterval,
	type Price,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";

import { isFeatureItem, isFeaturePriceItem } from "./getItemType.js";

export const addIdsToProductItems = ({
	items,
	curPrices,
	curEnts,
}: {
	items: ProductItem[];
	curPrices: Price[];
	curEnts: EntitlementWithFeature[];
}) => {
	// 1. Handle base price
	const entIds = new Set<string>();
	const priceIds = new Set<string>();

	const basePriceItem = items.find((item) => item.price_id === null);
	const baseCurPrice = curPrices.find((price) => isFixedPrice(price));

	if (basePriceItem && baseCurPrice) {
		basePriceItem.price_id = baseCurPrice.id;
		basePriceItem.price_config = baseCurPrice.config;
		priceIds.add(baseCurPrice.id);
	}

	// Feature items
	const featureIdToItems: Record<string, ProductItem[]> = {};
	const featureIdToCurEnts: Record<string, EntitlementWithFeature[]> = {};
	for (const item of items) {
		if (!item.feature_id) continue;

		if (!featureIdToItems[item.feature_id]) {
			featureIdToItems[item.feature_id] = [item];
		} else {
			featureIdToItems[item.feature_id].push(item);
		}

		featureIdToItems[item.feature_id].sort((a, b) => {
			if (isFeatureItem(a) && isFeatureItem(b)) return 0;

			// If there's a price, go first,
			if (isFeaturePriceItem(a) && !isFeaturePriceItem(b)) return -1;
			if (!isFeaturePriceItem(a) && isFeaturePriceItem(b)) return 1;

			// Sort by interval
			const aIntervalValue = entIntervalToValue(
				itemToEntInterval({ item: a }) as EntInterval,
			);
			const bIntervalValue = entIntervalToValue(
				itemToEntInterval({ item: b }) as EntInterval,
			);
			if (!aIntervalValue.eq(bIntervalValue)) {
				return aIntervalValue.sub(bIntervalValue).toNumber();
			}

			// If it's pay per use usage model, go first,
			if (
				a.usage_model === UsageModel.PayPerUse &&
				b.usage_model !== UsageModel.PayPerUse
			)
				return -1;
			if (
				a.usage_model !== UsageModel.PayPerUse &&
				b.usage_model === UsageModel.PayPerUse
			)
				return 1;

			return 0;
		});
	}

	for (const curEnt of curEnts) {
		if (!curEnt.feature_id) continue;
		if (!featureIdToCurEnts[curEnt.feature_id]) {
			featureIdToCurEnts[curEnt.feature_id] = [curEnt];
		} else {
			featureIdToCurEnts[curEnt.feature_id].push(curEnt);
		}

		featureIdToCurEnts[curEnt.feature_id].sort((a, b) => {
			// 1. a hasprice
			const aPrice = entToPrice({ ent: a, prices: curPrices });
			const bPrice = entToPrice({ ent: b, prices: curPrices });

			if (!aPrice && !bPrice) return 0;
			if (aPrice && !bPrice) return -1;
			if (!aPrice && bPrice) return 1;

			const aIntervalValue = entIntervalToValue(a.interval, a.interval_count);
			const bIntervalValue = entIntervalToValue(b.interval, b.interval_count);
			if (!aIntervalValue.eq(bIntervalValue)) {
				return aIntervalValue.sub(bIntervalValue).toNumber();
			}

			const isPrepaid =
				getBillingType(aPrice!.config) === BillingType.UsageInAdvance;
			const isPrepaidB =
				getBillingType(bPrice!.config) === BillingType.UsageInAdvance;
			if (isPrepaid && !isPrepaidB) return -1;
			if (!isPrepaid && isPrepaidB) return 1;

			return 0;
		});
	}

	for (const featureId in featureIdToItems) {
		for (let i = 0; i < featureIdToItems[featureId].length; i++) {
			// featureIdToItems[featureId][i].id = generateId("item");
			const entLength = featureIdToCurEnts[featureId]?.length ?? 0;
			if (entLength > i) {
				const ent = featureIdToCurEnts[featureId]?.[i];
				if (ent && !entIds.has(ent.id)) {
					entIds.add(ent.id);
					featureIdToItems[featureId][i].entitlement_id = ent.id;
				}
			}
		}
	}
};
