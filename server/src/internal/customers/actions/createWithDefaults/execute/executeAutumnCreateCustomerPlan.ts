import { CusExpand, tryCatch } from "@autumn/shared";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan.js";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated.js";
import type { CreateCustomerContext } from "@/internal/customers/actions/createWithDefaults/createCustomerContext.js";
import { CusService } from "../../../CusService.js";

export type ExecuteAutumnResult = { type: "created" } | { type: "existing" };

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
	context,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<ExecuteAutumnResult> => {
	const { db, logger } = ctx;
	const { fullCustomer } = context;

	let wasUpdate = false;

	const { error } = await tryCatch(
		db.transaction(async (tx) => {
			const txDb = tx as unknown as DrizzleCli;

			const upsertResult = await CusService.upsert({
				db: txDb,
				data: fullCustomer,
			});

			if (upsertResult.wasUpdate) {
				fullCustomer.internal_id = upsertResult.customer.internal_id;
				wasUpdate = true;
				return;
			}

			await executeAutumnBillingPlan({
				ctx: { ...ctx, db: txDb },
				autumnBillingPlan,
			});
		}),
	);

	if (error) {
		if (isUniqueConstraintError(error)) {
			logger.info(
				`Customer already exists, returning existing: ${fullCustomer.id || fullCustomer.email}`,
			);
			const existingCustomer = await CusService.getFull({
				db,
				idOrInternalId: fullCustomer.id || fullCustomer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
				withEntities: true,
				withSubs: true,
				expand: [CusExpand.Invoices],
			});
			context.fullCustomer = existingCustomer;
			return { type: "existing" };
		}
		throw error;
	}

	if (wasUpdate) {
		logger.info(
			`Customer already exists (claimed or existing): ${fullCustomer.id || fullCustomer.internal_id}`,
		);
		const existingCustomer = await CusService.getFull({
			db,
			idOrInternalId: fullCustomer.internal_id,
			orgId: ctx.org.id,
			env: ctx.env,
			withEntities: true,
			withSubs: true,
			expand: [CusExpand.Invoices],
		});
		context.fullCustomer = existingCustomer;
		return { type: "existing" };
	}

	// Queue webhooks after transaction commits successfully
	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan,
		billingContext: context,
	});

	return { type: "created" };
};
