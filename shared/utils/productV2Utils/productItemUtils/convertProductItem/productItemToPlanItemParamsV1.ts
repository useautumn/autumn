import { InternalError } from "@api/errors/base/InternalError";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1";
import {
	AllocatedBillingBehavior,
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import {
	type ProductItem,
	ProductItemFeatureType,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../../types/sharedContext";
import { itemToUsageType } from "../convertItemUtils";
import { isFeaturePriceItem } from "../getItemType";
import { productItemsToPlanItemsV1 } from "./productItemToPlanItemV1";

const itemToAllocatedLegacyProration = ({
	ctx,
	item,
}: {
	ctx: SharedContext;
	item: ProductItem;
}): CreatePlanItemParamsV1["proration"] => {
	const usageType = itemToUsageType({ item, features: ctx.features });
	const isPayPerUseContinuous =
		usageType === ProductItemFeatureType.ContinuousUse &&
		isFeaturePriceItem(item) &&
		item.usage_model !== UsageModel.Prepaid;

	if (!isPayPerUseContinuous) return undefined;
	if (
		item.config?.allocated_billing_behavior === AllocatedBillingBehavior.Arrear
	) {
		return undefined;
	}

	return {
		on_increase: item.config?.on_increase ?? OnIncrease.ProrateImmediately,
		on_decrease: item.config?.on_decrease ?? OnDecrease.Prorate,
	};
};

export const productItemToPlanItemParamsV1 = ({
	ctx,
	item,
}: {
	ctx: SharedContext;
	item: ProductItem;
}): CreatePlanItemParamsV1 => {
	const planItemV1 = productItemsToPlanItemsV1({
		items: [item],
		features: ctx.features,
		expand: ctx.expand,
	})?.[0];

	if (!planItemV1) {
		throw new InternalError({
			message: "Failed to convert product item to plan item params v1",
		});
	}

	const proration =
		planItemV1.proration ??
		itemToAllocatedLegacyProration({
			ctx,
			item,
		});

	return {
		feature_id: planItemV1.feature_id,
		included: planItemV1.included,
		unlimited: planItemV1.unlimited,
		reset: planItemV1.reset ?? undefined,
		price: planItemV1.price
			? {
					amount: planItemV1.price.amount,
					tiers: planItemV1.price.tiers,
					interval: planItemV1.price.interval,
					interval_count: planItemV1.price.interval_count,
					billing_units: planItemV1.price.billing_units,
					billing_method: planItemV1.price.billing_method,
					max_purchase: planItemV1.price.max_purchase ?? undefined,
					tier_behavior: planItemV1.price.tier_behavior ?? undefined,
				}
			: undefined,
		proration: proration
			? {
					on_increase: proration.on_increase ?? OnIncrease.ProrateImmediately,
					on_decrease: proration.on_decrease ?? OnDecrease.Prorate,
				}
			: undefined,

		rollover: planItemV1.rollover
			? {
					max: planItemV1.rollover.max ?? undefined,
					max_percentage: planItemV1.rollover.max_percentage ?? undefined,
					expiry_duration_type: planItemV1.rollover.expiry_duration_type,
					expiry_duration_length:
						planItemV1.rollover.expiry_duration_length ?? undefined,
				}
			: undefined,

		// Add internal fields
		entity_feature_id: item.entity_feature_id ?? undefined,
		entitlement_id: item.entitlement_id ?? undefined,
		price_id: item.price_id ?? undefined,
	};
};
