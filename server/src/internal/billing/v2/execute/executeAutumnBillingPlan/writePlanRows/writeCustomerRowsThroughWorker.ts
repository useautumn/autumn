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

export type WrittenCustomerRows = AutumnBillingPlanResult & {
	rebalancesApplied: boolean;
};

export const writeCustomerRowsThroughWorker = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<WrittenCustomerRows> => {
	const customerId = billingPlanToWorkerCustomerId({ autumnBillingPlan });
	if (!customerId)
		throw new InternalError({
			message: "A plan routed to the balance worker names no single customer",
		});

	const { data: result, error } = await tryCatch(
		applyBillingPlanOnWorker({ ctx, customerId, autumnBillingPlan }),
	);
	if (isBalanceWorkerStaleSubjectError(error)) {
		const written = await withPlanTransaction({
			ctx,
			run: (transactionCtx) =>
				writeCustomerRowsInPostgres({ ctx: transactionCtx, autumnBillingPlan }),
		});
		return { ...written, rebalancesApplied: false };
	}
	if (error) throw error;

	await markCustomerUpdatedAt({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		internalCustomerId: result.internalCustomerId,
	});
	return { ...result, rebalancesApplied: true };
};
