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

	return await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
		version,
	});
};
