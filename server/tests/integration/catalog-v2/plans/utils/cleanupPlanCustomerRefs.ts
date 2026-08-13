import { customerProducts, customers } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Delete every customer (and their cusProduct rows) attached to these plans. */
export const cleanupPlanCustomerRefs = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		const cusProds = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.product_id, planId));
		for (const row of cusProds) {
			await ctx.db
				.delete(customerProducts)
				.where(eq(customerProducts.id, row.id));
			await ctx.db
				.delete(customers)
				.where(eq(customers.internal_id, row.internal_customer_id));
		}
	}
};
