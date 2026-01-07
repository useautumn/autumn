import { InternalError } from "@api/errors/base/InternalError";
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

// Overload: errorOnNotFound = true → guaranteed Feature
export function priceToFeature(params: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
	errorOnNotFound: true;
}): Feature;

// Overload: errorOnNotFound = false/undefined → Feature | undefined
export function priceToFeature(params: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
	errorOnNotFound?: false;
}): Feature | undefined;

// Implementation
export function priceToFeature({
	price,
	ents,
	features,
	errorOnNotFound,
}: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
	errorOnNotFound?: boolean;
}): Feature | undefined {
	if (!features && !ents) {
		throw new Error("priceToFeature requires either ents or features as arg");
	}

	let result: Feature | undefined;

	if (features) {
		result = features.find(
			(f) =>
				f.internal_id ===
				(price.config as UsagePriceConfig).internal_feature_id,
		);
	} else {
		const ent = priceToEnt({ price, entitlements: ents ?? [] });
		result = ent?.feature;
	}

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Feature not found for price ${price.id}`,
		});
	}

	return result;
}

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
