import {
	type ApiPlanItemV0,
	ApiPlanItemV0Schema,
} from "@api/products/items/apiPlanItemV0.js";
import { CusExpand } from "@models/cusModels/cusExpand.js";
import { Infinite } from "@models/productModels/productEnums.js";
import {
	type ProductItem,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { InternalError } from "../../api/models.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { expandIncludes } from "../expandUtils.js";
import {
	isBooleanFeature,
	isContUseFeature,
} from "../featureUtils/convertFeatureUtils.js";
import { toApiFeature } from "../featureUtils.js";
import { getProductItemDisplay } from "../productDisplayUtils.js";
import { isFeaturePriceItem } from "../productV2Utils/productItemUtils/getItemType.js";
import { itemToBillingInterval } from "../productV2Utils/productItemUtils/itemIntervalUtils.js";
import { itemIntvToResetIntv } from "./planFeatureIntervals.js";

// const getFeaturePriceItemParams = ({
// 	item,
// 	feature,
// }: {
// 	item: ProductItem;
// 	feature: Feature;
// }) => {

// 	// 1. If
// 	// reset_interval: itemIntvToResetIntv(
// 	// 	item.interval!,
// 	// ) as ResetInterval,
// 	// ...(item.interval_count !== undefined &&
// 	// item.interval_count !== null
// 	// 	? {
// 	// 			reset_interval_count: item.interval_count,
// 	// 		}
// 	// 	: {}),
// 	return {
// 		interval: item.interval,
// 	};
// };

const itemToReset = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature: Feature;
}) => {
	// 1. If continuous use or boolean, no reset
	if (isContUseFeature({ feature }) || isBooleanFeature({ feature })) {
		return null;
	}

	return {
		interval: itemIntvToResetIntv(item.interval ?? null),
		interval_count:
			item.interval_count !== 1 && typeof item.interval_count === "number"
				? item.interval_count
				: undefined,
		reset_when_enabled: item.reset_usage_when_enabled ?? false,
	} satisfies ApiPlanItemV0["reset"];
};

const itemToPlanFeaturePrice = ({ item }: { item: ProductItem }) => {
	if (!isFeaturePriceItem(item)) {
		return null;
	}

	const includedUsage =
		item.included_usage === Infinite ? 0 : (item.included_usage ?? 0);
	const maxPurchase = item.usage_limit
		? item.usage_limit - includedUsage
		: null;

	const price =
		item.tiers && item.tiers.length === 1 ? item.tiers[0].amount : item.price;

	const tiers =
		item.tiers && item.tiers.length > 1
			? item.tiers.map((tier) => ({
					to: tier.to,
					amount: tier.amount,
				}))
			: undefined;

	return {
		amount: price ?? undefined,
		tiers: tiers,

		interval: itemToBillingInterval({ item }),
		interval_count:
			item.interval_count !== 1 && typeof item.interval_count === "number"
				? item.interval_count
				: undefined,

		billing_units: item.billing_units ?? 1,
		usage_model: item.usage_model || UsageModel.PayPerUse,
		max_purchase: maxPurchase,
	} satisfies ApiPlanItemV0["price"];
};

const itemToPlanFeatureRollover = ({ item }: { item: ProductItem }) => {
	if (!item.config?.rollover) return undefined;

	return {
		max: item.config.rollover.max ?? null,
		expiry_duration_type: item.config.rollover.duration,
		expiry_duration_length: item.config.rollover.length,
	} satisfies ApiPlanItemV0["rollover"];
};

const itemToPlanFeatureProration = ({ item }: { item: ProductItem }) => {
	if (!item.config?.on_increase || !item.config?.on_decrease) return undefined;

	if (!isFeaturePriceItem(item)) return undefined;

	return {
		on_increase: item.config.on_increase,
		on_decrease: item.config.on_decrease,
	} satisfies ApiPlanItemV0["proration"];
};

export const itemsToPlanFeatures = ({
	items,
	features,
	expand = [],
}: {
	items: ProductItem[];
	features: Feature[];
	expand?: string[];
}): ApiPlanItemV0[] => {
	if (!items) return [];

	const shouldExpandFeature = expandIncludes({
		expand,
		includes: [CusExpand.PlanFeaturesFeature],
	});

	return items.map((item) => {
		const feature = features.find((f) => f.id === item.feature_id);
		if (!item.feature_id || !feature) {
			throw new InternalError({
				message:
					"Converting item to plan feature: item has no feature ID or feature not found",
			});
		}

		// 1. Granted balance
		const grantedBalance =
			item.included_usage === Infinite ? 0 : (item.included_usage ?? 0);

		const reset = itemToReset({ item, feature });
		const price = itemToPlanFeaturePrice({ item });
		const rollover = itemToPlanFeatureRollover({ item });
		const proration = itemToPlanFeatureProration({ item });

		// Convert feature to API format if expand requested
		const apiFeature = shouldExpandFeature
			? toApiFeature({ feature })
			: undefined;

		return ApiPlanItemV0Schema.parse({
			feature_id: item.feature_id,
			feature: apiFeature,
			granted_balance: grantedBalance,
			unlimited: item.included_usage === Infinite,

			reset,
			price,

			rollover,
			proration,

			display: getProductItemDisplay({ item, features }),

			// Other fields
			// entity_feature_id: item.entity_feature_id,
		} satisfies ApiPlanItemV0);
	});
};

// // Conditionally set reset_interval OR price.interval (mutually exclusive)
// // If has pricing: interval goes in price
// // If no pricing: interval goes in reset_interval
// ...(!hasPrice && item.interval
// 	? {
// 			reset_interval: itemIntvToResetIntv(
// 				item.interval!,
// 			) as ResetInterval,
// 			...(item.interval_count !== undefined &&
// 			item.interval_count !== null
// 				? {
// 						reset_interval_count: item.interval_count,
// 					}
// 				: {}),
// 		}
// 	: {}),

// ...(hasPrice
// 	? (() => {
// 			// Check if this is a single tier to infinity (stored as tier but should be flat amount)
// 			const isSingleTierToInf =
// 				item.tiers &&
// 				item.tiers.length === 1 &&
// 				item.tiers[0].to === TierInfinite;

// 			return {
// 				price: {
// 					interval: (item.interval || "month") as BillingInterval,
// 					billing_units: item.billing_units ?? 1,
// 					usage_model: (item.usage_model || "pay_per_use") as UsageModel,
// 					max_purchase: 1,
// 					// If single tier to infinity, extract amount; otherwise use item.price
// 					amount: isSingleTierToInf
// 						? item.tiers![0].amount
// 						: item.price || 0,
// 					// Only include tiers if multi-tier
// 					...(item.tiers && item.tiers.length > 1
// 						? {
// 								tiers: item.tiers.map((tier) => ({
// 									to: tier.to === TierInfinite ? TierInfinite : tier.to,
// 									amount: tier.amount,
// 								})),
// 							}
// 						: {}),
// 					interval_count: item.interval_count ?? undefined,
// 				},
// 			};
// 		})()
// 	: {}),
