import { type AttachBodyV1, ProductNotFoundError } from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { ProductService } from "../../../../products/ProductService";

export const getProductsForAttach = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: AttachBodyV1;
}) => {
	const { org, env } = ctx;
	const { plan_id: planId, version } = body;

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: org.id,
		env,
		idOrInternalId: planId,
		version,
	});

	if (!fullProduct) {
		throw new ProductNotFoundError({ productId: planId });
	}

	return [fullProduct];
};
