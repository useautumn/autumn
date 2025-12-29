import type { FullCusEntWithFullCusProduct, FullCusEntWithOptionalProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { FullCustomerPrice } from "@models/cusProductModels/cusPriceModels/cusPriceModels.js";
import type { FeatureOptions } from "@models/cusProductModels/cusProductModels.js";
import type {
	Entitlement,
	EntitlementWithFeature,
} from "../../models/productModels/entModels/entModels.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";
import type { FullProduct } from "../../models/productModels/productModels.js";

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

export const entToOptions = ({
	ent,
	options,
}: {
	ent: Entitlement;
	options: FeatureOptions[];
}) => {
	return options.find(
		(option) => option.internal_feature_id === ent.internal_feature_id,
	);
};

export const cusEntToCusPrice = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct;
}) => {
	const cusProduct = cusEnt.customer_product;
	const cusPrices = cusProduct?.customer_prices ?? [];
	return cusPrices.find((cusPrice: FullCustomerPrice) => {
		const productMatch =
			cusPrice.customer_product_id === cusEnt.customer_product_id;

		const entMatch = cusPrice.price.entitlement_id === cusEnt.entitlement.id;

		return productMatch && entMatch;
	});
};

export const productToEnt = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) => {
	return product.entitlements.find((ent) => ent.feature.id === featureId);
};
