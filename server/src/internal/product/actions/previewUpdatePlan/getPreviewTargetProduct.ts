import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const getPreviewTargetProduct = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) => {
	const { db, org, env } = ctx;

	const product = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
		version,
	});

	if (product.base_internal_product_id !== null) {
		throw new RecaseError({
			message: `Cannot preview an update on variant plan ${planId}. Preview the base plan instead.`,
			code: ErrCode.CannotPreviewOnVariant,
			statusCode: 400,
		});
	}

	return product;
};
