import {
	type EntitlementWithFeature,
	type Feature,
	type FullProduct,
	getItemFeatureType,
	type Price,
	type ProductItem,
	type ProductV2,
	toProductItem,
} from "@autumn/shared";
import { getEntRelatedPrice } from "./entitlements/entitlementUtils.js";
import { getPriceEntitlement } from "./prices/priceUtils.js";

export const mapToProductItems = ({
	prices,
	entitlements,
	features,
	allowFeatureMatch = false,
}: {
	prices: Price[];
	entitlements: EntitlementWithFeature[];
	features: Feature[];
	allowFeatureMatch?: boolean;
}): ProductItem[] => {
	const items: ProductItem[] = [];

	for (const ent of entitlements) {
		const relatedPrice = getEntRelatedPrice(ent, prices, allowFeatureMatch);
		const item = toProductItem({ ent, price: relatedPrice });
		items.push(item);
	}

	for (const price of prices) {
		const relatedEnt = getPriceEntitlement(
			price,
			entitlements,
			allowFeatureMatch,
		);

		if (!relatedEnt) {
			items.push(toProductItem({ price }));
		}
	}

	for (const item of items) {
		const feature = features.find((f) => f.id === item.feature_id);
		if (feature) {
			item.feature_type = getItemFeatureType({ item, features });
		}
	}

	return items;
};

export const mapToProductV2 = ({
	product,
	features,
}: {
	product: FullProduct;
	features: Feature[];
}): ProductV2 => {
	const items: ProductItem[] = [];
	// console.log("Prices:", product.prices);
	// console.log("Entitlements:", product.entitlements);

	for (const ent of product.entitlements) {
		const relatedPrice = getEntRelatedPrice(ent, product.prices);
		items.push(toProductItem({ ent, price: relatedPrice }));
	}

	for (const price of product.prices) {
		const relatedEnt = getPriceEntitlement(price, product.entitlements);

		// console.log("Price:", price.id);
		// console.log("Related ent:", relatedEnt);
		if (!relatedEnt) {
			items.push(toProductItem({ price }));
		}
	}

	for (const item of items) {
		item.feature_type = getItemFeatureType({ item, features });
	}

	const productV2: ProductV2 = {
		internal_id: product.internal_id,
		env: product.env,
		id: product.id,
		name: product.name,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		version: product.version,
		group: product.group,
		free_trial: product.free_trial,
		created_at: product.created_at,

		items: items,
		stripe_id: product.processor?.id || null,
		archived: product.archived || false,
	};

	return productV2;
};
