import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";

/** The catalog version a customer product points at. A load failure resolves to
 * null, which derivation reads as custom rather than failing the caller. */
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

/** Catalog versions keyed by internal product id, shared by every derivation in one run. */
export type BaseProductCache = Map<string, Promise<FullProduct | null>>;

/** `loadBaseProduct`, at most once per cache. A null result is not kept, so a failed read is retried. */
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
