import { type FullCusProduct, FullCustomer } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ACTIVE_STATUSES, CusProductService } from "../CusProductService.js";

export const findCusProductById = async ({
	db,
	internalCustomerId,
	productId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	productId: string;
}) => {
	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId,
	});

	return cusProducts.find(
		(cusProduct: FullCusProduct) => cusProduct.product.id === productId,
	);
};
