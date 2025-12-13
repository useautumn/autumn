import {
	type AppEnv,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";

export const getMainCusProduct = async ({
	db,
	customerId,
	orgId,
	env,
	productGroup,
}: {
	db: DrizzleCli;
	customerId: string;
	orgId: string;
	env: AppEnv;
	productGroup?: string;
}) => {
	const customer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId,
		env,
		withEntities: true,
		inStatuses: [CusProductStatus.Active],
	});

	const cusProducts = customer.customer_products;

	const mainCusProduct = cusProducts.find(
		(cusProduct: FullCusProduct) =>
			!cusProduct.product.is_add_on &&
			(productGroup ? cusProduct.product.group === productGroup : true),
	);

	return mainCusProduct;
};
