import {
	CusProductStatus,
	customerProducts as customerProductsTable,
	type customerProducts,
	type customers,
	type FullProduct,
} from "@autumn/shared";
import { customerProductToDefaultProduct } from "@utils/cusProductUtils/convertCusProduct/customerProductToDefaultProduct";
import { and, eq, type InferSelectModel } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { DrizzleCli } from "@/db/initDrizzle";
import { CusService } from "@/internal/customers/CusService";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

/**
 * Handles the revert case inside a transaction: expire the trial cusProduct
 * and unpause the previous one atomically so we never leave a customer
 * without an active plan.
 *
 * Returns true if the revert was handled, false if it should fall through
 * to the standard expiry path.
 */
const tryProcessRevertExpiry = async ({
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
	const reverted = await tryProcessRevertExpiry({
		ctx,
		customerProduct,
		customerId: customer.id ?? "",
	});
	if (reverted) return;

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
