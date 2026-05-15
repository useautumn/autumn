import {
	CusProductStatus,
	customerProducts as customerProductsTable,
	type customerProducts,
} from "@autumn/shared";
import { and, eq, type InferSelectModel } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

/**
 * Handles trial expiry for products that have a previous_customer_product_id.
 *
 * - on_trial_end === "revert": expire trial, unpause previous (restore)
 * - on_trial_end === "bill": expire previous only (trial stays active, billing starts)
 *
 * Returns true if handled, false to fall through to standard expiry.
 */
export const tryProcessTrialWithPreviousPlan = async ({
	ctx,
	customerProduct,
	customerId,
}: {
	ctx: AutumnContext;
	customerProduct: InferSelectModel<typeof customerProducts>;
	customerId: string;
}): Promise<boolean> => {
	const previousCusProductId = customerProduct.previous_customer_product_id;
	if (!previousCusProductId) return false;

	const isRevert = customerProduct.on_trial_end === "revert";
	const now = Date.now();

	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;

		if (isRevert) {
			// Revert: expire trial, unpause previous
			await txDb
				.update(customerProductsTable)
				.set({ status: CusProductStatus.Expired, updated_at: now })
				.where(eq(customerProductsTable.id, customerProduct.id));

			await txDb
				.update(customerProductsTable)
				.set({ status: CusProductStatus.Active, updated_at: now })
				.where(
					and(
						eq(customerProductsTable.id, previousCusProductId),
						eq(customerProductsTable.status, CusProductStatus.Paused),
					),
				);
		} else {
			// Bill: expire previous only, trial stays active (billing starts)
			await txDb
				.update(customerProductsTable)
				.set({ status: CusProductStatus.Expired, updated_at: now })
				.where(eq(customerProductsTable.id, previousCusProductId));
		}
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: isRevert ? "productCron:revert" : "productCron:bill",
	});

	return true;
};
