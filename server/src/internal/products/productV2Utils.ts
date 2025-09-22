import {
	EntitlementWithFeature,
	Feature,
	FullProduct,
	Price,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { getEntRelatedPrice } from "./entitlements/entitlementUtils.js";
import { getPriceEntitlement } from "./prices/priceUtils.js";
import { toProductItem } from "@autumn/shared";
import { getItemFeatureType } from "@autumn/shared";

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
	let items: ProductItem[] = [];

	for (const ent of entitlements) {
		let relatedPrice = getEntRelatedPrice(ent, prices, allowFeatureMatch);
		let item = toProductItem({ ent, price: relatedPrice });
		items.push(item);
	}

	for (const price of prices) {
		let relatedEnt = getPriceEntitlement(
			price,
			entitlements,
			allowFeatureMatch,
		);

		if (!relatedEnt) {
			items.push(toProductItem({ price }));
		}
	}

	for (const item of items) {
		let feature = features.find((f) => f.id == item.feature_id);
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
	let items: ProductItem[] = [];
	// console.log("Prices:", product.prices);
	// console.log("Entitlements:", product.entitlements);

	for (const ent of product.entitlements) {
		let relatedPrice = getEntRelatedPrice(ent, product.prices);
		items.push(toProductItem({ ent, price: relatedPrice }));
	}

	for (const price of product.prices) {
		let relatedEnt = getPriceEntitlement(price, product.entitlements);

		// console.log("Price:", price.id);
		// console.log("Related ent:", relatedEnt);
		if (!relatedEnt) {
			items.push(toProductItem({ price }));
		}
	}

	for (const item of items) {
		item.feature_type = getItemFeatureType({ item, features });
	}

	let productV2: ProductV2 = {
		internal_id: product.internal_id,

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
