import type {
	Entitlement,
	FullProduct,
	Price,
	ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { itemToPriceAndEnt } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt.js";

export const buildIncomingFullProduct = ({
	ctx,
	base,
	product,
}: {
	ctx: AutumnContext;
	base: FullProduct;
	product: ProductV2;
}): FullProduct => {
	const { org, features } = ctx;
	const prices: Price[] = [];
	const ents: Entitlement[] = [];

	for (const item of product.items) {
		const feature = features.find((f) => f.id === item.feature_id);
		const { newEnt, newPrice, sameEnt, samePrice } = itemToPriceAndEnt({
			item,
			orgId: org.id,
			internalProductId: base.internal_id,
			feature,
			isCustom: false,
			features,
		});
		const ent = newEnt || sameEnt;
		const price = newPrice || samePrice;
		if (ent) ents.push(ent);
		if (price) prices.push(price);
	}

	return {
		...base,
		id: product.id ?? base.id,
		name: product.name ?? base.name,
		is_add_on: product.is_add_on ?? base.is_add_on,
		is_default: product.is_default ?? base.is_default,
		group: product.group ?? base.group,
		prices,
		entitlements: getEntsWithFeature({
			ents,
			features,
		}),
		free_trial: product.free_trial ?? base.free_trial,
		config: product.config ?? base.config,
		metadata: product.metadata ?? base.metadata,
	} as FullProduct;
};
