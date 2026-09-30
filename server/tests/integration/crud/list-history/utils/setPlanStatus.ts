import { type CusProductStatus, customerProducts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

/** Moves one of the customer's plans to a DB status (e.g. past_due) and drops the cached customer. */
export const setPlanStatus = async ({
	ctx,
	customerId,
	productId,
	status,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId: string;
	status: CusProductStatus;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const plan = customer.customer_products.find(
		(customerProduct) => customerProduct.product.id === productId,
	);
	if (!plan) throw new Error(`Customer holds no plan ${productId}`);

	await ctx.db
		.update(customerProducts)
		.set({ status })
		.where(eq(customerProducts.id, plan.id));
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "setPlanStatus",
		flushBalances: true,
	});
};
