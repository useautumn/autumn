import {
	type FullProduct,
	orgMultiCurrencyEnabled,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import {
	lockProductForItemUpdate,
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
		await lockProductForItemUpdate({
			db: tx,
			internalProductId: fullProduct.internal_id,
		});
		const currentFullProduct = await ProductService.getFull({
			db: tx,
			idOrInternalId: fullProduct.internal_id,
			orgId: fullProduct.org_id,
			env: fullProduct.env,
			version: fullProduct.version,
		});
		await lockProductItemsForUpdate({
			db: tx,
			currentFullProduct,
		});
		const shouldUseInPlaceEdit =
			useInPlaceEdit ||
			(await productItemsHaveCustomerReferences({
				db: tx,
				currentFullProduct,
			}));

		if (!shouldUseInPlaceEdit) {
			await handleNewProductItems({
				db: tx,
				curPrices: currentFullProduct.prices,
				curEnts: currentFullProduct.entitlements,
				newItems,
				features,
				product: currentFullProduct,
				logger: ctx.logger,
				isCustom: false,
				multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
			});
			return;
		}

		const inPlace = await resolveInPlaceEdit({
			db: tx,
			items: newItems,
			currentFullProduct,
			features,
		});
		await handleNewProductItems({
			db: tx,
			curPrices: inPlace.curPrices,
			curEnts: inPlace.curEnts,
			newItems: inPlace.items,
			features,
			product: currentFullProduct,
			logger: ctx.logger,
			isCustom: false,
			multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
		});
	});
};
