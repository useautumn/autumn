import type {
	Entitlement,
	EntitlementWithFeature,
} from "../../models/productModels/entModels/entModels.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";

// export const getEntRelatedPrice = (
//   entitlement: Entitlement,
//   prices: Price[],
//   allowFeatureMatch = false
// ) => {
//   return prices.find((price) => {
//     if (price.config?.type === PriceType.Fixed) {
//       return false;
//     }

//     let config = price.config as UsagePriceConfig;

//     if (allowFeatureMatch) {
//       return entitlement.internal_feature_id == config.internal_feature_id;
//     }

//     let entIdMatch = entitlement.id == price.entitlement_id;
//     let productIdMatch =
//       entitlement.internal_product_id == price.internal_product_id;
//     return entIdMatch && productIdMatch;
//   });
// };

export const entToPrice = ({
	ent,
	prices,
}: {
	ent: Entitlement;
	prices: Price[];
}) => {
	return prices.find(
		(price) =>
			price.entitlement_id === ent.id &&
			price.internal_product_id === ent.internal_product_id,
	);
};

export const priceToEnt = ({
	price,
	entitlements,
}: {
	price: Price;
	entitlements: EntitlementWithFeature[];
}) => {
	return entitlements.find(
		(ent) =>
			ent.id === price.entitlement_id &&
			ent.internal_product_id === price.internal_product_id,
	);
};
