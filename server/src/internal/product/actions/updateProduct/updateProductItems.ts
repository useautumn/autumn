import {
	type FullProduct,
	orgMultiCurrencyEnabled,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import {
	lockProductItemsForUpdate,
	productItemsHaveCustomerReferences,
	resolveInPlaceEdit,
} from "../inPlaceUpdateUtils.js";

export const updateProductItems = async ({
	ctx,
	db,
	fullProduct,
	newItems,
	features,
	useInPlaceEdit,
}: {
	ctx: AutumnContext;
	db: DrizzleCli;
	fullProduct: FullProduct;
	newItems: NonNullable<UpdateProductV2Params["items"]>;
	features: AutumnContext["features"];
	useInPlaceEdit: boolean;
}) => {
	await db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await lockProductItemsForUpdate({
			db: tx,
			currentFullProduct: fullProduct,
		});
		const shouldUseInPlaceEdit =
			useInPlaceEdit ||
			(await productItemsHaveCustomerReferences({
				db: tx,
				currentFullProduct: fullProduct,
			}));

		if (!shouldUseInPlaceEdit) {
			await handleNewProductItems({
				db: tx,
				curPrices: fullProduct.prices,
				curEnts: fullProduct.entitlements,
				newItems,
				features,
				product: fullProduct,
				logger: ctx.logger,
				isCustom: false,
				multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
			});
			return;
		}

		const inPlace = await resolveInPlaceEdit({
			db: tx,
			items: newItems,
			currentFullProduct: fullProduct,
			features,
		});
		await handleNewProductItems({
			db: tx,
			curPrices: inPlace.curPrices,
			curEnts: inPlace.curEnts,
			newItems: inPlace.items,
			features,
			product: fullProduct,
			logger: ctx.logger,
			isCustom: false,
			multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
		});
	});
};
