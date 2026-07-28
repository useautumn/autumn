import {
	type AutumnBillingPlan,
	CusProductStatus,
	type customerProducts,
	customerProducts as customerProductsTable,
	findCustomerProductById,
} from "@autumn/shared";
import { and, eq, type InferSelectModel } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { CusService } from "@/internal/customers/CusService";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

/**
 * Handles revert trial expiry inside a transaction: expire the trial
 * cusProduct and unpause the previous one atomically so we never leave a
 * customer without an active plan.
 *
 * Emits the `billing.updated` webhook (tag: `trial_ended`) describing both
 * the trial expiry and the restored previous plan.
 *
 * Returns true if handled, false to fall through to standard expiry.
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

	// Snapshot fullCustomer BEFORE the transaction so the webhook payload
	// reflects pre-revert state in `previous_attributes`. RELEVANT_STATUSES
	// is broadened with Paused so the previous (paused) cusProduct is
	// visible — keeping the query narrow vs. ALL_STATUSES.
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
		inStatuses: [...RELEVANT_STATUSES, CusProductStatus.Paused],
	});

	const trialFullCusProduct = findCustomerProductById({
		fullCustomer,
		customerProductId: customerProduct.id,
	});
	const previousFullCusProduct = findCustomerProductById({
		fullCustomer,
		customerProductId: previousCusProductId,
	});

	const now = Date.now();
	const restoredPreviousCustomerProduct = await ctx.db.transaction(
		async (tx) => {
			const txDb = tx as unknown as DrizzleCli;

			await txDb
				.update(customerProductsTable)
				.set({ status: CusProductStatus.Expired, updated_at: now })
				.where(eq(customerProductsTable.id, customerProduct.id));

			const restoredRows = await txDb
				.update(customerProductsTable)
				.set({ status: CusProductStatus.Active, updated_at: now })
				.where(
					and(
						eq(customerProductsTable.id, previousCusProductId),
						eq(customerProductsTable.status, CusProductStatus.Paused),
					),
				)
				.returning({ id: customerProductsTable.id });

			return restoredRows.length > 0;
		},
	);

	if (trialFullCusProduct) {
		await applyPooledBalanceCustomerProductTransitions({
			ctx,
			fullCustomer,
			outgoingCustomerProducts: [trialFullCusProduct],
			incomingCustomerProducts:
				restoredPreviousCustomerProduct && previousFullCusProduct
					? [
							{
								...previousFullCusProduct,
								status: CusProductStatus.Active,
							},
						]
					: [],
			now,
		});
	}

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "productCron:revert",
	});

	// Emit billing.updated webhook (fire-and-forget) describing both the
	// trial expiry and the restored previous plan. Skipped silently if we
	// couldn't resolve either snapshot.
	if (trialFullCusProduct && previousFullCusProduct) {
		const autumnBillingPlan: AutumnBillingPlan = {
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct: trialFullCusProduct,
					updates: { status: CusProductStatus.Expired },
				},
				{
					customerProduct: previousFullCusProduct,
					updates: { status: CusProductStatus.Active },
				},
			],
		};

		void sendBillingUpdatedWebhook({
			ctx,
			autumnBillingPlan,
			originalFullCustomer: fullCustomer,
			tags: ["trial_ended"],
		});
	}

	return true;
};
