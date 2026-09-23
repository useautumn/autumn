import {
	type AutumnBillingPlan,
	InternalError,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isBalanceWorkerStaleSubjectError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { applyBillingPlanOnWorker } from "@/internal/balanceWorker/billingPlan/applyBillingPlanOnWorker";
import { billingPlanToWorkerCustomerId } from "@/internal/balanceWorker/billingPlan/routing/billingPlanToWorkerCustomerId";
import type { AutumnBillingPlanResult } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { markCustomerUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { withPlanTransaction } from "./withPlanTransaction";
import { writeCustomerRowsInPostgres } from "./writeCustomerRowsInPostgres";

/** The rows the worker holds, as one worker mutation answered once Postgres holds them. A create's email claim happens in the worker. */
export const writeCustomerRowsThroughWorker = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<AutumnBillingPlanResult> => {
	const customerId = billingPlanToWorkerCustomerId({ autumnBillingPlan });
	if (!customerId)
		throw new InternalError({
			message: "A plan routed to the balance worker names no single customer",
		});

	const { data: result, error } = await tryCatch(
		applyBillingPlanOnWorker({ ctx, customerId, autumnBillingPlan }),
	);
	// Still behind after a resend: the legacy write instead; the worker dropped its copy, so its next read is fresh.
	if (isBalanceWorkerStaleSubjectError(error))
		return withPlanTransaction({
			ctx,
			run: (transactionCtx) =>
				writeCustomerRowsInPostgres({ ctx: transactionCtx, autumnBillingPlan }),
		});
	if (error) throw error;

	// Replica reads of this customer pin to the primary for a while: a create or claim, like any structural write.
	await markCustomerUpdatedAt({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		internalCustomerId: result.internalCustomerId,
	});
	return result;
};
