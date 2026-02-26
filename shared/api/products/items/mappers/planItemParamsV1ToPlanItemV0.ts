import { FeatureNotFoundError } from "@api/errors/classes/featureErrClasses.js";
import { billingMethodToUsageModel } from "@api/products/components/mappers/billingMethodTousageModel.js";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1.js";
import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0.js";
import { featureUtils } from "@utils/index";
import { subtractIncludedFromTiers } from "@utils/productV2Utils/productItemUtils/tierUtils.js";
import type { SharedContext } from "../../../../types/sharedContext.js";

/**
 * Converts V1 plan item params (CreatePlanItemParamsV1) to V0 response format (ApiPlanItemV0)
 */
export function planItemParamsV1ToPlanItemV0({
	ctx,
	item,
}: {
	ctx: SharedContext;
	item: CreatePlanItemParamsV1;
}): ApiPlanItemV0 {
	const { features } = ctx;

	const feature = features.find((f) => f.id === item.feature_id);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId: item.feature_id });
	}

	const isAllocatedFeature = featureUtils.isAllocated(feature);

	const included = item.included ?? 0;

	// V1 API: tier `to` values INCLUDE included usage.
	// Internal: tier `to` values do NOT include included usage.
	const internalTiers = item.price?.tiers
		? subtractIncludedFromTiers({ tiers: item.price.tiers, included })
		: undefined;

	return {
		feature_id: item.feature_id,
		granted_balance: included,
		unlimited: item.unlimited ?? false,

		reset: item.reset
			? {
					interval: item.reset.interval,
					interval_count: item.reset.interval_count,
					reset_when_enabled: !isAllocatedFeature,
				}
			: null,

		price: item.price
			? {
					amount: item.price.amount,
					tiers: internalTiers,
					tier_behavior: item.price.tier_behavior,
					interval: item.price.interval,
					interval_count: item.price.interval_count,
					billing_units: item.price.billing_units ?? 1,
					usage_model: billingMethodToUsageModel(item.price.billing_method),
					max_purchase: item.price.max_purchase ?? null,
				}
			: null,

		rollover: item.rollover
			? {
					max: item.rollover.max ?? null,
					expiry_duration_type: item.rollover.expiry_duration_type,
					expiry_duration_length: item.rollover.expiry_duration_length,
				}
			: undefined,

		proration: item.proration,
	};
}
