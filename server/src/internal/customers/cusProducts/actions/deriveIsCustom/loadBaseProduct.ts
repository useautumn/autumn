import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";

/** A load failure resolves to null, which derivation reads as custom. */
export const loadBaseProduct = async ({
	ctx,
	internalProductId,
}: {
	ctx: AutumnContext;
	internalProductId: string;
}): Promise<FullProduct | null> => {
	try {
		return await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: internalProductId,
			orgId: ctx.org.id,
			env: ctx.env,
			allowNotFound: true,
		});
	} catch (error) {
		ctx.logger.warn(
			`[isCustom] could not load base product ${internalProductId}`,
			{
				error,
			},
		);
		return null;
	}
};

export type BaseProductCache = Map<string, Promise<FullProduct | null>>;

/** A null result is not kept, so a failed read is retried. */
export const loadCachedBaseProduct = async ({
	ctx,
	internalProductId,
	baseProducts,
}: {
	ctx: AutumnContext;
	internalProductId: string;
	baseProducts: BaseProductCache;
}): Promise<FullProduct | null> => {
	const cached = baseProducts.get(internalProductId);
	if (cached) return cached;
	const loading = loadBaseProduct({ ctx, internalProductId });
	baseProducts.set(internalProductId, loading);
	const baseProduct = await loading;
	if (!baseProduct) baseProducts.delete(internalProductId);
	return baseProduct;
};
