import type { Feature } from "../../models/featureModels/featureModels.js";
import type { EntitlementWithFeature } from "../../models/productModels/entModels/entModels.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";
import type { FullProduct } from "../../models/productModels/productModels.js";
import type { ProductItem } from "../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../models/productV2Models/productV2Models.js";
import { entToPrice, priceToEnt } from "../productUtils/convertProductUtils.js";
import { toProductItem } from "./productItemUtils/mapToItem.js";
import { getItemFeatureType } from "./productItemUtils/productItemUtils.js";

export const mapToProductItems = ({
	prices,
	entitlements,
	features,
}: {
	prices: Price[];
	entitlements: EntitlementWithFeature[];
	features: Feature[];
}): ProductItem[] => {
	const items: ProductItem[] = [];

	for (const ent of entitlements) {
		// const relatedPrice = getEntRelatedPrice(ent, prices, allowFeatureMatch);
		const relatedPrice = entToPrice({ ent, prices });
		const item = toProductItem({ ent, price: relatedPrice });
		items.push(item);
	}

	for (const price of prices) {
		const relatedEnt = priceToEnt({ price, entitlements });

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
	features?: Feature[];
}): ProductV2 => {
	const items: ProductItem[] = [];

	for (const ent of product.entitlements) {
		const relatedPrice = entToPrice({ ent, prices: product.prices });
		items.push(toProductItem({ ent, price: relatedPrice }));
	}

	for (const price of product.prices) {
		const relatedEnt = priceToEnt({
			price,
			entitlements: product.entitlements,
		});

		if (!relatedEnt) {
			items.push(toProductItem({ price }));
		}
	}

	if (!features) {
		features = product.entitlements.map((ent) => ent.feature);
	}

	for (const item of items) {
		item.feature_type = getItemFeatureType({ item, features });
	}

	const productV2: ProductV2 = {
		internal_id: product.internal_id,

		id: product.id,
		name: product.name,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		version: product.version,
		group: product.group || null,
		free_trial: product.free_trial,
		created_at: product.created_at,
		env: product.env,

		items: items,
		stripe_id: product.processor?.id || null,
		archived: product.archived || false,
	};

	return productV2;
};
