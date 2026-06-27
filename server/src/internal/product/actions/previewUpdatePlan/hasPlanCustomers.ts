import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const hasPlanCustomers = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}) => {
	const cusProducts = await CusProductService.getByInternalProductId({
		db: ctx.db,
		internalProductId: product.internal_id,
		limit: 1,
	});

	return cusProducts.length > 0;
};
