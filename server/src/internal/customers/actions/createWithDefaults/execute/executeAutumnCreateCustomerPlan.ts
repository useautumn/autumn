import {
	CustomerAlreadyExistsError,
	type FullCustomer,
	tryCatch,
} from "@autumn/shared";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan.js";
import { CusService } from "../../../CusService.js";

export type ExecuteAutumnResult =
	| { type: "created"; fullCustomer: FullCustomer }
	| { type: "existing"; fullCustomer: FullCustomer };

/**
 * Execute the Autumn (DB) part of customer creation.
 *
 * 1. Transaction: upsert customer + insert customer products
 * 2. Handle race conditions by returning existing customer
 *
 * Returns discriminated union to indicate if customer was created or already existed.
 */
export const executeAutumnCreateCustomerPlan = async ({
	ctx,
	fullCustomer,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<ExecuteAutumnResult> => {
	const { db, logger } = ctx;

	const { data: newFullCustomer, error } = await tryCatch(
		db.transaction(async (tx) => {
			const txDb = tx as unknown as DrizzleCli;

			const upsertResult = await CusService.upsert({
				db: txDb,
				data: fullCustomer,
			});

			if (upsertResult.wasUpdate) {
				fullCustomer.internal_id = upsertResult.customer.internal_id;
				throw new CustomerAlreadyExistsError({
					customerId: fullCustomer.id || fullCustomer.internal_id,
				});
			}

			await executeAutumnBillingPlan({
				ctx: { ...ctx, db: txDb },
				autumnBillingPlan,
			});

			return {
				...fullCustomer,
				customer_products: autumnBillingPlan.insertCustomerProducts,
			};
		}),
	);

	// Handle existing customer (from upsert or race condition)
	if (error) {
		if (
			error instanceof CustomerAlreadyExistsError ||
			isUniqueConstraintError(error)
		) {
			logger.info(
				`Customer already exists, returning existing: ${fullCustomer.id || fullCustomer.email}`,
			);
			const existingCustomer = await CusService.getFull({
				db,
				idOrInternalId: fullCustomer.id || fullCustomer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			return { type: "existing", fullCustomer: existingCustomer };
		}
		throw error;
	}

	return { type: "created", fullCustomer: newFullCustomer };
};
