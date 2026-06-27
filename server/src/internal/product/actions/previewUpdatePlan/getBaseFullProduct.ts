import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const getBaseFullProduct = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const { db, org, env } = ctx;

	const base = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	if (base.base_internal_product_id != null) {
		throw new RecaseError({
			message: "Cannot preview update on a variant plan",
			code: ErrCode.CannotPreviewOnVariant,
		});
	}

	return base;
};
