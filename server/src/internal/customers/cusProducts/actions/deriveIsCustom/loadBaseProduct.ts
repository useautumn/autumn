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
