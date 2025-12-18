// import type { PlanOverride } from "@autumn/shared";
import {
	type FullProduct,
	InternalError,
	type ProductItem,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { getEntsWithFeature } from "../../../../products/entitlements/entitlementUtils";
import { handleNewProductItems } from "../../../../products/product-items/productItemUtils/handleNewProductItems";

// 1. Only override base product
// 2. Assume features + prices are passed in together
export const overrideProduct = async ({
	ctx,
	newItems,
	products,
}: {
	ctx: AutumnContext;
	newItems?: ProductItem[];
	products: FullProduct[];
}) => {
	if (!newItems) {
		return {
			fullProducts: products,
			customPrices: [],
			customEnts: [],
		};
	}

	if (products.length === 0) {
		throw new InternalError({
			message: "[overrideProduct] products array is empty",
		});
	}

	if (products.length > 1) {
		throw new InternalError({
			message: "[overrideProduct] products array has more than one product",
		});
	}

	const { db, logger, features } = ctx;
	// const { price, features: planFeatures } = planOverride;

	// const newBasePriceItem = planToProductV2PriceItem({
	// 	price: price ?? null,
	// 	features,
	// });

	// const featureItems = planFeaturesToItems({
	// 	planFeatures: planFeatures ?? [],
	// 	features,
	// });

	// const newItems = [newBasePriceItem, ...featureItems];

	const product = products[0];

	const { prices, entitlements, customPrices, customEnts } =
		await handleNewProductItems({
			db,
			curPrices: product.prices,
			curEnts: product.entitlements,
			newItems,
			features,
			product,
			logger,
			isCustom: true,
		});

	const newFullProduct = {
		...product,
		prices,
		entitlements: getEntsWithFeature({ ents: entitlements, features }),
	};

	return {
		fullProducts: [newFullProduct],
		customPrices,
		customEnts,
	};
};
