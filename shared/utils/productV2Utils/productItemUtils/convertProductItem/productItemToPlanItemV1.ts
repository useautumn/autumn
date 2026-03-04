import { BillingMethod } from "@api/products/components/billingMethod.js";
import { PlanExpand } from "@api/products/components/planExpand.js";
import {
	type ApiPlanItemV1,
	ApiPlanItemV1Schema,
} from "@api/products/items/apiPlanItemV1.js";
import { Infinite } from "@models/productModels/productEnums.js";
import {
	type ProductItem,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { InternalError } from "../../../../api/models.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import { expandIncludes } from "../../../expandUtils.js";
import {
	isBooleanFeature,
	isContUseFeature,
} from "../../../featureUtils/convertFeatureUtils.js";
import { toApiFeature } from "../../../featureUtils.js";
import { getProductItemDisplay } from "../../../productDisplayUtils.js";
import { isFeaturePriceItem } from "../getItemType.js";
import { itemToBillingInterval } from "../itemIntervalUtils.js";
import { addIncludedToTiers } from "../tierUtils.js";
import { itemIntvToResetIntv } from "./planItemIntervals.js";

const itemToReset = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature: Feature;
}): ApiPlanItemV1["reset"] => {
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
		// Note: reset_when_enabled is NOT in V1 schema - removed
	};
};

const itemToPlanFeaturePrice = ({
	item,
}: {
	item: ProductItem;
}): ApiPlanItemV1["price"] => {
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

	// Internal: tier `to` does NOT include included usage.
	// V1 API: tier `to` INCLUDES included usage.
	const tiers =
		item.tiers && item.tiers.length > 1
			? addIncludedToTiers({
					tiers: item.tiers.map((tier) => ({
						to: tier.to,
						amount: tier.amount,
						flat_amount: tier.flat_amount,
					})),
					included: includedUsage,
				})
			: undefined;

	// V1 schema uses billing_method, NOT usage_model
	const billingMethod =
		item.usage_model === UsageModel.PayPerUse
			? BillingMethod.UsageBased
			: BillingMethod.Prepaid;

	return {
		amount: price ?? undefined,
		tiers: tiers,
		tier_behavior: item.tier_behavior ?? undefined,

		interval: itemToBillingInterval({ item }),
		interval_count:
			item.interval_count !== 1 && typeof item.interval_count === "number"
				? item.interval_count
				: undefined,

		billing_units: item.billing_units ?? 1,
		billing_method: billingMethod,
		max_purchase: maxPurchase,
	};
};

const itemToPlanFeatureRollover = ({
	item,
}: {
	item: ProductItem;
}): ApiPlanItemV1["rollover"] => {
	if (!item.config?.rollover) return undefined;

	return {
		max: item.config.rollover.max ?? null,
		expiry_duration_type: item.config.rollover.duration,
		expiry_duration_length: item.config.rollover.length,
	};
};

const itemToPlanFeatureProration = ({
	item,
}: {
	item: ProductItem;
}): ApiPlanItemV1["proration"] => {
	if (!item.config?.on_increase || !item.config?.on_decrease) return undefined;

	if (!isFeaturePriceItem(item)) return undefined;

	return {
		on_increase: item.config.on_increase,
		on_decrease: item.config.on_decrease,
	};
};

export const productItemsToPlanItemsV1 = ({
	items,
	features,
	expand = [],
	currency,
}: {
	items: ProductItem[];
	features: Feature[];
	expand?: string[];
	currency?: string;
}): ApiPlanItemV1[] => {
	if (!items) return [];

	const shouldExpandFeature = expandIncludes({
		expand,
		includes: [PlanExpand.ItemsFeature],
	});

	return items.map((item) => {
		const feature = features.find((f) => f.id === item.feature_id);
		if (!item.feature_id || !feature) {
			throw new InternalError({
				message:
					"Converting item to plan feature: item has no feature ID or feature not found",
			});
		}

		// 1. Included balance (V1 uses "included", not "granted_balance")
		const included =
			item.included_usage === Infinite ? 0 : (item.included_usage ?? 0);

		const reset = itemToReset({ item, feature });
		const price = itemToPlanFeaturePrice({ item });
		const rollover = itemToPlanFeatureRollover({ item });
		const proration = itemToPlanFeatureProration({ item });

		// Convert feature to API format if expand requested
		const apiFeature = shouldExpandFeature
			? toApiFeature({ feature })
			: undefined;

		return ApiPlanItemV1Schema.parse({
			feature_id: item.feature_id,
			feature: apiFeature,
			included: included,
			unlimited: item.included_usage === Infinite,

			reset,
			price, // V1: price can be null (no need for conditional spread)

			rollover,
			proration,

			display: getProductItemDisplay({ item, features, currency }),
		});
	});
};
