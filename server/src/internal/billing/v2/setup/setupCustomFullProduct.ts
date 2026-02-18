import {
	type CustomizePlanV1,
	customizePlanV1ToV0,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems";

export const setupCustomFullProduct = async ({
	ctx,
	// customItems,
	currentFullProduct,
	customizePlan,
}: {
	ctx: AutumnContext;
	// customItems?: ProductItem[];
	currentFullProduct: FullProduct;
	customizePlan?: CustomizePlanV1;
}) => {
	if (!customizePlan) {
		return {
			fullProduct: currentFullProduct,
			customPrices: [],
			customEnts: [],
		};
	}

	const newItems = customizePlanV1ToV0({
		ctx,
		customizePlanV1: customizePlan,
		fullProduct: currentFullProduct,
	});

	// Customize plan -> custom items

	const { db, logger, features } = ctx;

	const { prices: currentPrices, entitlements: currentEntitlements } =
		currentFullProduct;

	const { prices, entitlements, customPrices, customEnts } =
		await handleNewProductItems({
			db,
			curPrices: currentPrices,
			curEnts: currentEntitlements,
			newItems,
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
