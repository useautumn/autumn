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
 * Handles the revert case inside a transaction: expire the trial cusProduct
 * and unpause the previous one atomically so we never leave a customer
 * without an active plan.
 *
 * Returns true if the revert was handled, false if it should fall through
 * to the standard expiry path.
 */
export const tryProcessRevertExpiry = async ({
	ctx,
	customerProduct,
	customerId,
}: {
	ctx: AutumnContext;
	customerProduct: InferSelectModel<typeof customerProducts>;
	customerId: string;
}): Promise<boolean> => {
	if (customerProduct.on_trial_end !== "revert") return false;

	const previousCusProductId = customerProduct.previous_customer_product_id;
	if (!previousCusProductId) {
		console.log(
			`[tryProcessRevertExpiry] No previous_customer_product_id on ${customerProduct.id}, falling back to standard expiry`,
		);
		return false;
	}

	const now = Date.now();
	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;

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
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "productCron:revert",
	});

	return true;
};
