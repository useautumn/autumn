import type { CreatePlanItemParamsV1 } from "@api/models";
import { billingMethodToUsageModel } from "@api/products/components/mappers/billingMethodTousageModel";
import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { featureUtils } from "@utils/featureUtils/index";
import type { SharedContext } from "../../../../types/sharedContext";
import type { ApiPlanItemV1 } from "../apiPlanItemV1";

/** Transform ApiPlanItemV1 to ApiPlanItemV0 */
export function planItemV1ToV0({
	ctx,
	item,
}: {
	ctx: SharedContext;
	item: ApiPlanItemV1 | CreatePlanItemParamsV1;
}): ApiPlanItemV0 {
	const { included = 0, price, ...restItem } = item;

	const billingUnits = price?.billing_units ?? 1;

	const feature = ctx.features.find((f) => f.id === item.feature_id);
	const resetUsageWhenEnabled = feature
		? featureUtils.isConsumable(feature)
		: true;

	return {
		...restItem,
		unlimited: item.unlimited ?? false,
		granted_balance: included,
		reset: item.reset
			? {
					interval: item.reset.interval,
					interval_count: item.reset.interval_count,
					reset_when_enabled: resetUsageWhenEnabled,
				}
			: null,
		price: price
			? {
					amount: price.amount,
					tiers: price.tiers,
					tier_behavior: price.tiers?.length
						? (price.tier_behavior ?? TierBehavior.Graduated)
						: undefined,
					interval: price.interval,
					interval_count: price.interval_count,
					billing_units: billingUnits,
					usage_model: billingMethodToUsageModel(price.billing_method),
					max_purchase: price.max_purchase ?? null,
				}
			: null,

		rollover: item.rollover
			? {
					max: item.rollover.max ?? null,
					expiry_duration_type: item.rollover.expiry_duration_type,
					expiry_duration_length: item.rollover.expiry_duration_length,
				}
			: undefined,

		entitlement_id: "entitlement_id" in item ? item.entitlement_id : undefined,
		price_id: "price_id" in item ? item.price_id : undefined,
	};
}
