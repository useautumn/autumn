import type { Feature } from "@models/featureModels/featureModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { priceToEnt } from "@utils/productUtils/convertUtils";

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
