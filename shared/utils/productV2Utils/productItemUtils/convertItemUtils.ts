import { RecaseError } from "../../../api/errors/base/RecaseError.js";
import { ProductErrorCode } from "../../../api/errors/codes/productErrCodes.js";
import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import { AllocatedBillingBehavior } from "../../../models/productV2Models/productItemModels/productItemEnums.js";
import {
	type ProductItem,
	ProductItemFeatureType,
	UsageModel,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import {
	isAllocatedPrice,
	isPayPerUsePrice,
} from "../../productUtils/priceUtils/classifyPriceUtils.js";
import { notNullish } from "../../utils.js";
import { isFeaturePriceItem } from "./getItemType.js";

export const itemToFeature = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = features.find((f) => f.id === item.feature_id);

	return feature;
};

export const itemToUsageType = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = itemToFeature({ item, features });
	if (!feature || !feature.config) return null;

	if (feature.type === FeatureType.Boolean) {
		return ProductItemFeatureType.Static;
	}

	if (feature.type === FeatureType.CreditSystem) {
		return ProductItemFeatureType.SingleUse;
	}

	return feature.config.usage_type as ProductItemFeatureType;
};

const resolveAllocatedBillingBehavior = ({
	item,
	curPrice,
}: {
	item: ProductItem;
	curPrice?: Price;
}): AllocatedBillingBehavior => {
	if (notNullish(item.config?.allocated_billing_behavior)) {
		return item.config.allocated_billing_behavior;
	}

	const hasProrationKnobs =
		notNullish(item.config?.on_increase) ||
		notNullish(item.config?.on_decrease);
	if (hasProrationKnobs) {
		return AllocatedBillingBehavior.Prorated;
	}

	if (curPrice && isPayPerUsePrice({ price: curPrice })) {
		const previousConfig = curPrice.config as Price["config"] & {
			allocated_billing_behavior?: AllocatedBillingBehavior;
		};
		if (notNullish(previousConfig.allocated_billing_behavior)) {
			return previousConfig.allocated_billing_behavior;
		}
		return isAllocatedPrice(curPrice)
			? AllocatedBillingBehavior.Prorated
			: AllocatedBillingBehavior.Arrear;
	}

	return AllocatedBillingBehavior.Arrear;
};

export const itemToAllocatedBillingBehavior = ({
	item,
	features,
	curPrice,
}: {
	item: ProductItem;
	features: Feature[];
	curPrice?: Price;
}): AllocatedBillingBehavior | null => {
	const usageType = itemToUsageType({ item, features });
	const isPayPerUseContinuous =
		usageType === ProductItemFeatureType.ContinuousUse &&
		isFeaturePriceItem(item) &&
		item.usage_model !== UsageModel.Prepaid;

	if (!isPayPerUseContinuous) return null;

	const allocatedBillingBehavior = resolveAllocatedBillingBehavior({
		item,
		curPrice,
	});

	if (allocatedBillingBehavior === AllocatedBillingBehavior.Arrear) {
		const hasProrationKnobs =
			notNullish(item.config?.on_increase) ||
			notNullish(item.config?.on_decrease);
		if (hasProrationKnobs) {
			throw new RecaseError({
				message: `on_increase / on_decrease are not supported for allocated arrear billing (feature: ${item.feature_id})`,
				code: ProductErrorCode.InvalidProductItem,
				statusCode: 400,
			});
		}
		if (notNullish(item.config?.rollover)) {
			throw new RecaseError({
				message: `rollover is not supported for allocated arrear billing because the balance never resets (feature: ${item.feature_id})`,
				code: ProductErrorCode.InvalidProductItem,
				statusCode: 400,
			});
		}
	}

	return allocatedBillingBehavior;
};
