import { Feature } from "../../models/featureModels/featureModels.js";
import { FullProduct } from "../../models/productModels/productModels.js";
import { ProductItem } from "../../models/productV2Models/productItemModels/productItemModels.js";
import { ProductV2 } from "../../models/productV2Models/productV2Models.js";
import { entToPrice, priceToEnt } from "../productUtils/convertUtils.js";
import { toProductItem } from "./productItemUtils/mapToItem.js";
import { getItemFeatureType } from "./productItemUtils/productItemUtils.js";

export const mapToProductV2 = ({
	product,
	features,
}: {
	product: FullProduct;
	features?: Feature[];
}): ProductV2 => {
	let items: ProductItem[] = [];

	for (const ent of product.entitlements) {
		let relatedPrice = entToPrice({ ent, prices: product.prices });
		items.push(toProductItem({ ent, price: relatedPrice }));
	}

	for (const price of product.prices) {
		let relatedEnt = priceToEnt({ price, entitlements: product.entitlements });

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
