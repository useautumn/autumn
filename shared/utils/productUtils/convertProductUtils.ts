import type { FeatureOptions } from "@models/cusProductModels/cusProductModels.js";
import type {
	Entitlement,
	EntitlementWithFeature,
} from "../../models/productModels/entModels/entModels.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";
import type { FullProduct } from "../../models/productModels/productModels.js";

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

export const productToEnt = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) => {
	return product.entitlements.find((ent) => ent.feature.id === featureId);
};
