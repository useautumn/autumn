import {
	type FullProduct,
	orgMultiCurrencyEnabled,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyCatalogPlanLicenseRebases,
	prepareCatalogPlanLicenseRebases,
} from "@/internal/licenses/actions/customize/rebaseCatalogPlanLicenses.js";
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
		const preparedLicenseRebases = await prepareCatalogPlanLicenseRebases({
			ctx,
			db: tx,
			baseProduct: currentFullProduct,
		});
		const shouldUseInPlaceEdit =
			useInPlaceEdit ||
			(await productItemsHaveCustomerReferences({
				db: tx,
				currentFullProduct,
			}));

		const preparedItems = shouldUseInPlaceEdit
			? await resolveInPlaceEdit({
					db: tx,
					items: newItems,
					currentFullProduct,
					features,
				})
			: {
					curPrices: currentFullProduct.prices,
					curEnts: currentFullProduct.entitlements,
					items: newItems,
				};
		await handleNewProductItems({
			db: tx,
			curPrices: preparedItems.curPrices,
			curEnts: preparedItems.curEnts,
			newItems: preparedItems.items,
			features,
			product: currentFullProduct,
			logger: ctx.logger,
			isCustom: false,
			multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
		});
		if (preparedLicenseRebases.length === 0) return;
		const newBaseProduct = await ProductService.getFull({
			db: tx,
			idOrInternalId: currentFullProduct.internal_id,
			orgId: currentFullProduct.org_id,
			env: currentFullProduct.env,
			version: currentFullProduct.version,
		});
		await applyCatalogPlanLicenseRebases({
			ctx,
			db: tx,
			newBaseProduct,
			prepared: preparedLicenseRebases,
		});
	});
};
