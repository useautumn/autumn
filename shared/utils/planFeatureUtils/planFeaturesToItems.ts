import type { ApiPlanFeature } from "@api/products/planFeature/apiPlanFeature.js";
import {
	type ProductItem,
	type ProductItemConfig,
	ProductItemSchema,
	type RolloverConfig,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { FeatureNotFoundError } from "../../api/models.js";
import type { UpdatePlanFeatureParams } from "../../api/products/planFeature/planFeatureOpModels.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import type { ProrationConfig } from "../../models/productModels/priceModels/priceModels.js";
import { Infinite } from "../../models/productModels/productEnums.js";
import {
	OnDecrease,
	OnIncrease,
} from "../../models/productV2Models/productItemModels/productItemEnums.js";
import { featureToItemFeatureType } from "../featureUtils/convertFeatureUtils.js";
import { billingToItemInterval } from "../productV2Utils/productItemUtils/itemIntervalUtils.js";
import { hasPrice, hasResetInterval } from "./classifyPlanFeature.js";
import { resetIntvToItemIntv } from "./planFeatureIntervals.js";

const planFeatureToItemInterval = ({
	planFeature,
}: {
	planFeature: ApiPlanFeature | UpdatePlanFeatureParams;
}) => {
	// 1. If feature has reset interval, use it
	if (hasResetInterval(planFeature)) {
		return resetIntvToItemIntv(planFeature.reset.interval);
	}

	// 2. If feature has price interval, use it
	if (hasPrice(planFeature)) {
		return billingToItemInterval({
			billingInterval: planFeature.price.interval,
		});
	}

	return null;
};

const planFeatureToItemConfig = ({
	planFeature,
}: {
	planFeature: ApiPlanFeature | UpdatePlanFeatureParams;
}) => {
	const toItemRollover = () => {
		if (planFeature.rollover) {
			return {
				max: planFeature.rollover.max,
				duration: planFeature.rollover.expiry_duration_type,
				length: planFeature.rollover.expiry_duration_length ?? 1,
			} satisfies RolloverConfig;
		}
		return undefined;
	};

	const toItemProration = () => {
		if (planFeature.proration) {
			return {
				on_increase:
					planFeature.proration.on_increase ?? OnIncrease.ProrateImmediately,
				on_decrease: planFeature.proration.on_decrease ?? OnDecrease.Prorate,
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

export const planFeaturesToItems = ({
	planFeatures,
	features,
}: {
	planFeatures: (ApiPlanFeature | UpdatePlanFeatureParams)[];
	features: Feature[];
}): ProductItem[] => {
	if (!planFeatures) return [];

	return planFeatures.map((planFeature) => {
		const feature = features.find((f) => f.id === planFeature.feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: planFeature.feature_id });
		}

		// Get interval
		const interval = planFeatureToItemInterval({ planFeature });
		const config = planFeatureToItemConfig({ planFeature });

		return ProductItemSchema.parse({
			feature_id: planFeature.feature_id,
			feature_type: featureToItemFeatureType({ feature }),

			included_usage: planFeature.unlimited
				? Infinite
				: planFeature.granted_balance,

			interval,
			interval_count: planFeature.reset?.interval_count,

			entity_feature_id: null,

			price: planFeature.price?.amount,

			tiers: planFeature.price?.tiers?.map((tier) => ({
				amount: tier.amount,
				to: tier.to,
			})),

			usage_model: planFeature.price?.usage_model,
			billing_units: planFeature.price?.billing_units,
			usage_limit: planFeature.price?.max_purchase
				? planFeature.price.max_purchase + (planFeature.granted_balance ?? 0)
				: undefined,

			reset_usage_when_enabled: planFeature.reset?.reset_when_enabled,

			config,

			display: "display" in planFeature ? planFeature.display : undefined,
		} satisfies ProductItem);
	});
};
