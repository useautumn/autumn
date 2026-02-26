import { InternalError } from "@api/errors/base/InternalError";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../../types/sharedContext";
import { productItemsToPlanItemsV1 } from "./productItemToPlanItemV1";

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
		proration: planItemV1.proration
			? {
					on_increase:
						planItemV1.proration.on_increase ?? OnIncrease.ProrateImmediately,
					on_decrease: planItemV1.proration.on_decrease ?? OnDecrease.Prorate,
				}
			: undefined,

		rollover: planItemV1.rollover
			? {
					max: planItemV1.rollover.max ?? undefined,
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
