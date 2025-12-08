import type {
	ApiProduct,
	ApiProductProperties,
} from "../../api/products/previousVersions/apiProduct.js";
import { BillingInterval } from "../../models/productModels/intervals/billingInterval.js";
import { UsageModel } from "../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../models/productV2Models/productV2Models.js";
import { productV2ToBasePrice } from "../productV3Utils/productItemUtils/productV3ItemUtils.js";
import { notNullish } from "../utils.js";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./productItemUtils/getItemType.js";
import { itemToBillingInterval } from "./productItemUtils/itemIntervalUtils.js";

export const productV2ToProperties = ({
	productV2,
	trialAvailable,
}: {
	productV2: ProductV2 | ApiProduct;
	trialAvailable: boolean;
}) => {
	const items = productV2.items;
	// 1. Is free
	const isFree = items.every(isFeatureItem);

	const isOneOff =
		!isFree &&
		items
			.filter((i) => isPriceItem(i) || isFeaturePriceItem(i))
			.some((i) => i.interval === null);

	// Get largest interval
	// Interval group:
	const basePriceItem = productV2ToBasePrice({
		product: productV2 as ProductV2,
	});
	let intervalGroup: BillingInterval | undefined;
	if (basePriceItem) {
		const billingInterval = itemToBillingInterval({ item: basePriceItem });

		if (billingInterval !== BillingInterval.OneOff) {
			intervalGroup = billingInterval;
		}
	}

	// Updateable
	const updateable =
		!isOneOff &&
		items.some(
			(i) => isFeaturePriceItem(i) && i.usage_model === UsageModel.Prepaid,
		);

	// Has trial
	const hasTrial = notNullish(productV2.free_trial) && trialAvailable;

	// 2. Is one off
	return {
		is_free: isFree,
		is_one_off: isOneOff,
		interval_group: intervalGroup,
		updateable: updateable,
		has_trial: hasTrial,
	} satisfies ApiProductProperties;
};
