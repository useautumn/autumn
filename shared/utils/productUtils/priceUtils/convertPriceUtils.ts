import type { Feature } from "@models/featureModels/featureModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import {
	shouldBillNow,
	shouldProrate,
	shouldSkipLineItems,
} from "@utils/billingUtils";
import { priceToEnt } from "@utils/productUtils/convertProductUtils";

export const priceToFeature = ({
	price,
	ents,
	features,
}: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
}) => {
	if (!features && !ents) {
		throw new Error("priceToFeature requires either ents or features as arg");
	}

	if (features) {
		return features.find(
			(f) =>
				f.internal_id ===
				(price.config as UsagePriceConfig).internal_feature_id,
		);
	}

	const ent = priceToEnt({ price, entitlements: ents ?? [] });
	return ent?.feature;
};

export const priceToProrationConfig = ({
	price,
	isUpgrade,
}: {
	price: Price;
	isUpgrade: boolean;
}): {
	prorationBehaviorConfig: OnIncrease | OnDecrease;
	shouldApplyProration: boolean;
	chargeImmediately: boolean;
	skipLineItems: boolean;
} => {
	const prorationBehaviorConfig = isUpgrade
		? (price.proration_config?.on_increase ?? OnIncrease.ProrateImmediately)
		: (price.proration_config?.on_decrease ?? OnDecrease.ProrateImmediately);

	return {
		prorationBehaviorConfig,
		shouldApplyProration: shouldProrate(prorationBehaviorConfig),
		chargeImmediately: shouldBillNow(prorationBehaviorConfig),
		skipLineItems: shouldSkipLineItems(prorationBehaviorConfig),
	};
};
