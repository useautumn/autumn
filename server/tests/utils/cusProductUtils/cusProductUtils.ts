import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";

export const getMainCusProduct = async ({
	ctx,
	customerId,
	productGroup,
}: {
	ctx: AutumnContext;
	customerId: string;
	productGroup?: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
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
