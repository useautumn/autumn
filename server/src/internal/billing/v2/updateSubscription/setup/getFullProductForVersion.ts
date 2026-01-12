import {
	cusProductToProduct,
	ErrCode,
	type FullCusProduct,
	type FullProduct,
	nullish,
	ProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";

/**
 * Get the full product for a specific version, or the current version if not specified.
 */
export const getFullProductForVersion = async ({
	ctx,
	targetCustomerProduct,
	version,
}: {
	ctx: AutumnContext;
	targetCustomerProduct: FullCusProduct;
	version?: number;
}): Promise<FullProduct> => {
	if (nullish(version)) {
		return cusProductToProduct({ cusProduct: targetCustomerProduct });
	}

	try {
		return await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: targetCustomerProduct.product.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version,
		});
	} catch (error) {
		if (error instanceof ProductNotFoundError) {
			throw new RecaseError({
				message: `Product version ${version} not found for product ${targetCustomerProduct.product.id}`,
				code: ErrCode.ProductNotFound,
				statusCode: 404,
			});
		}
		throw error;
	}
};
