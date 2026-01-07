import type { FullProduct, ProductItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems";

export const setupCustomFullProduct = async ({
	ctx,
	customItems,
	currentFullProduct,
}: {
	ctx: AutumnContext;
	customItems?: ProductItem[];
	currentFullProduct: FullProduct;
}) => {
	if (!customItems) {
		return {
			fullProduct: currentFullProduct,
			customPrices: [],
			customEnts: [],
		};
	}

	const { db, logger, features } = ctx;

	const { prices: currentPrices, entitlements: currentEntitlements } =
		currentFullProduct;

	const { prices, entitlements, customPrices, customEnts } =
		await handleNewProductItems({
			db,
			curPrices: currentPrices,
			curEnts: currentEntitlements,
			newItems: customItems,
			features,
			product: currentFullProduct,
			logger,
			isCustom: true,
		});

	const newFullProduct = {
		...currentFullProduct,
		prices,
		entitlements: getEntsWithFeature({ ents: entitlements, features }),
	};

	return {
		fullProduct: newFullProduct,
		customPrices,
		customEnts,
	};
};
