import {
	CusProductStatus,
	type customerProducts,
	type customers,
	type FullProduct,
} from "@autumn/shared";
import { customerProductToDefaultProduct } from "@utils/cusProductUtils/convertCusProduct/customerProductToDefaultProduct";
import type { InferSelectModel } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

export const processExpiredTrialRow = async ({
	ctx,
	customerProduct,
	customer,
	defaultProducts,
}: {
	ctx: AutumnContext;
	customerProduct: InferSelectModel<typeof customerProducts>;
	customer: InferSelectModel<typeof customers>;
	defaultProducts: FullProduct[];
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer.internal_id,
		withEntities: true,
		withSubs: true,
	});

	const fullCustomerProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === customerProduct.id,
	);

	if (!fullCustomerProduct) return;

	const defaultProduct = customerProductToDefaultProduct({
		ctx,
		customerProduct: fullCustomerProduct,
		defaultProducts,
	});

	if (defaultProduct) {
		await activateFreeDefaultProduct({
			ctx,
			customerProduct: fullCustomerProduct,
			fullCustomer,
			defaultProduct,
		});
	}
	await CusProductService.update({
		ctx,
		cusProductId: fullCustomerProduct.id,
		updates: {
			status: CusProductStatus.Expired,
		},
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? "",
		source: "productCron",
	});
};
