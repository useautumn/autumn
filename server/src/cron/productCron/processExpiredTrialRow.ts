import {
	CusProductStatus,
	type customerProducts,
	type customers,
	type FullProduct,
} from "@autumn/shared";
import { customerProductToDefaultProduct } from "@utils/cusProductUtils/convertCusProduct/customerProductToDefaultProduct";
import type { InferSelectModel } from "drizzle-orm";
import { resolveRedisForCustomer } from "@/external/redis/customerRedisRouting.js";
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
	// Shallow-copy ctx so concurrent Promise.all callers don't stomp each other's redis
	const customerCtx: AutumnContext = {
		...ctx,
		redis: customer.id
			? resolveRedisForCustomer({ org: ctx.org, customerId: customer.id })
			: ctx.redis,
	};

	const fullCustomer = await CusService.getFull({
		ctx: customerCtx,
		idOrInternalId: customer.internal_id,
		withEntities: true,
		withSubs: true,
	});

	const fullCustomerProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === customerProduct.id,
	);

	if (!fullCustomerProduct) return;

	const defaultProduct = customerProductToDefaultProduct({
		ctx: customerCtx,
		customerProduct: fullCustomerProduct,
		defaultProducts,
	});

	if (defaultProduct) {
		await activateFreeDefaultProduct({
			ctx: customerCtx,
			customerProduct: fullCustomerProduct,
			fullCustomer,
			defaultProduct,
		});
	}
	await CusProductService.update({
		ctx: customerCtx,
		cusProductId: fullCustomerProduct.id,
		updates: {
			status: CusProductStatus.Expired,
		},
	});

	await deleteCachedFullCustomer({
		ctx: customerCtx,
		customerId: fullCustomer.id ?? "",
		source: "productCron",
	});
};
