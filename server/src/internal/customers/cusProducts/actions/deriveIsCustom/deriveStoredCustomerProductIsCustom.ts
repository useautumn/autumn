import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deriveCustomerProductIsCustom } from "./deriveCustomerProductIsCustom";
import {
	type BaseProductCache,
	loadCachedBaseProduct,
} from "./loadBaseProduct";
import type { CustomerProductIsCustomResult } from "./types/customerProductIsCustomResult";
import { withLicenseBaseProducts } from "./withLicenseBaseProducts";

/** `deriveCustomerProductIsCustom` for a customer product read from the DB: loads its catalog
 * version and its customised licenses' catalog products first. */
export const deriveStoredCustomerProductIsCustom = async ({
	ctx,
	customerProduct,
	baseProducts,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	baseProducts: BaseProductCache;
}): Promise<CustomerProductIsCustomResult> => {
	const [baseProduct, hydrated] = await Promise.all([
		loadCachedBaseProduct({
			ctx,
			internalProductId: customerProduct.internal_product_id,
			baseProducts,
		}),
		withLicenseBaseProducts({ ctx, customerProduct, baseProducts }),
	]);
	if (!hydrated) return { isCustom: true, reason: "catalog_missing" };

	return deriveCustomerProductIsCustom({
		ctx,
		customerProduct: hydrated,
		baseProduct,
		features: ctx.features,
	});
};
