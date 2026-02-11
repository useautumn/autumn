import { FeatureNotFoundError } from "@api/errors/classes/featureErrClasses.js";
import { billingMethodToUsageModel } from "@api/products/components/mappers/billingMethodTousageModel.js";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1.js";
import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0.js";
import { featureUtils } from "@utils/index";
import type { SharedContext } from "../../../../types/sharedContext.js";

/**
 * Converts V1 plan item params (CreatePlanItemParamsV0) to V0 response format (ApiPlanItemV0)
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

	return {
		feature_id: item.feature_id,
		granted_balance: item.included ?? 0,
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
					tiers: item.price.tiers,
					interval: item.price.interval,
					interval_count: item.price.interval_count,
					billing_units: item.price.billing_units ?? 1,
					usage_model: billingMethodToUsageModel(item.price.billing_method),
					max_purchase: item.price.max_purchase ?? null,
				}
			: null,

		rollover: item.rollover
			? {
					max: item.rollover.max,
					expiry_duration_type: item.rollover.expiry_duration_type,
					expiry_duration_length: item.rollover.expiry_duration_length,
				}
			: undefined,

		proration: item.proration,
	};
}
