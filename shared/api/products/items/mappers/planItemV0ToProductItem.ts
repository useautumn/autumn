import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0";
import type { ProrationConfig } from "@models/productModels/priceModels/priceModels";
import { Infinite } from "@models/productModels/productEnums";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import {
	type ProductItem,
	type ProductItemConfig,
	ProductItemSchema,
	ProductItemType,
	type RolloverConfig,
} from "@models/productV2Models/productItemModels/productItemModels";
import { dbToApiFeatureV1 } from "@utils/featureUtils/apiFeatureToDbFeature";
import { featureToItemFeatureType } from "@utils/featureUtils/convertFeatureUtils";
import { featureUtils } from "@utils/featureUtils/index";
import { resetIntvToItemIntv } from "@utils/productV2Utils/productItemUtils/convertProductItem/planItemIntervals";
import { billingToItemInterval } from "@utils/productV2Utils/productItemUtils/itemIntervalUtils";
import type { SharedContext } from "../../../../types/sharedContext";
import {
	type ApiFeatureV0,
	type CreateBalanceParamsV0,
	FeatureNotFoundError,
} from "../../../models";
import { ApiVersion } from "../../../versionUtils/ApiVersion";
import { ApiVersionClass } from "../../../versionUtils/ApiVersionClass";
import { hasPrice, hasResetInterval } from "../utils/classifyPlanItemV0";

const planItemV0ToProductItemInterval = ({
	planItemV0,
}: {
	planItemV0: ApiPlanItemV0;
}) => {
	// 1. If feature has reset interval, use it
	if (hasResetInterval(planItemV0)) {
		return resetIntvToItemIntv(planItemV0.reset.interval);
	}

	// 2. If feature has price interval, use it
	if (hasPrice(planItemV0)) {
		return billingToItemInterval({
			billingInterval: planItemV0.price.interval,
		});
	}

	return null;
};

const planItemV0ToItemConfig = ({
	planItemV0,
}: {
	planItemV0: ApiPlanItemV0;
}) => {
	const toItemRollover = () => {
		if (planItemV0.rollover) {
			return {
				max: planItemV0.rollover.max,
				duration: planItemV0.rollover.expiry_duration_type,
				length: planItemV0.rollover.expiry_duration_length ?? 1,
			} satisfies RolloverConfig;
		}
		return undefined;
	};

	const toItemProration = () => {
		if (planItemV0.proration) {
			return {
				on_increase:
					planItemV0.proration.on_increase ?? OnIncrease.ProrateImmediately,
				on_decrease: planItemV0.proration.on_decrease ?? OnDecrease.Prorate,
			} satisfies ProrationConfig;
		}
		return undefined;
	};

	const rollover = toItemRollover();
	const proration = toItemProration();

	if (rollover || proration) {
		return {
			rollover,
			on_increase: proration?.on_increase,
			on_decrease: proration?.on_decrease,
		} satisfies ProductItemConfig;
	}
	return undefined;
};

/**
 * Augmented CreateBalanceParams that can be used for planFeaturesToItems function
 */
type CreateBalanceForPlanFeatureMap = CreateBalanceParamsV0 & {
	price?: undefined;
} & {
	reset?: CreateBalanceParamsV0["reset"] & { reset_when_enabled: true };
};

export const planItemV0ToProductItem = ({
	ctx,
	planItem,
}: {
	ctx: SharedContext;
	planItem: ApiPlanItemV0;
}): ProductItem => {
	const { features } = ctx;

	const feature = features.find((f) => f.id === planItem.feature_id);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId: planItem.feature_id });
	}

	// Get interval
	const interval = planItemV0ToProductItemInterval({ planItemV0: planItem });
	const config = planItemV0ToItemConfig({ planItemV0: planItem });

	const type = planItem.price
		? ProductItemType.FeaturePrice
		: ProductItemType.Feature;

	const entitlementId =
		"entitlement_id" in planItem ? planItem.entitlement_id : undefined;
	const priceId = "price_id" in planItem ? planItem.price_id : undefined;

	const resetUsageWhenEnabled = featureUtils.isConsumable(feature);

	return ProductItemSchema.parse({
		type,

		feature_id: planItem.feature_id,
		feature_type: featureToItemFeatureType({ feature }),
		feature: dbToApiFeatureV1({
			ctx,
			dbFeature: feature,
			targetVersion: new ApiVersionClass(ApiVersion.V1_2),
		}) as unknown as ApiFeatureV0,

		included_usage: planItem.unlimited ? Infinite : planItem.granted_balance,

		interval,
		interval_count: planItem.reset?.interval_count,

		price: planItem.price?.amount,

		tiers: planItem.price?.tiers?.map((tier) => ({
			amount: tier.amount,
			to: tier.to,
		})),
		tier_behaviour: planItem.price?.tier_behaviour,

		usage_model: planItem.price?.usage_model,
		billing_units: planItem.price?.billing_units,
		usage_limit: planItem.price?.max_purchase
			? planItem.price.max_purchase + (planItem.granted_balance ?? 0)
			: undefined,

		reset_usage_when_enabled:
			planItem.reset?.reset_when_enabled ?? resetUsageWhenEnabled,

		config,

		display: "display" in planItem ? planItem.display : undefined,

		entitlement_id: entitlementId,
		price_id: priceId,

		entity_feature_id: planItem.entity_feature_id,
	} satisfies ProductItem);
};
