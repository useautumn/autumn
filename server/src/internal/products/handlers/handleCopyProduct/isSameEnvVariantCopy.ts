import type { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** A variant can never be promoted across orgs, so a same-env variant copy
 * always means a sibling copy in the current org. */
export const isSameEnvVariantCopy = async ({
	ctx,
	fromProductId,
	toEnv,
}: {
	ctx: AutumnContext;
	fromProductId: string;
	toEnv: AppEnv;
}): Promise<boolean> => {
	if (toEnv !== ctx.env) return false;

	const fromProduct = await ProductService.get({
		db: ctx.db,
		id: fromProductId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return !!fromProduct?.base_internal_product_id;
};
