import type { AutumnBillingPlan } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanRoutesToWorker } from "@/internal/balanceWorker/billingPlan/routing/billingPlanRoutesToWorker";
import type { PendingBatchTransition } from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions";
import type { AutumnBillingPlanResult } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { withPlanTransaction } from "./withPlanTransaction";
import { writeCustomerRowsInPostgres } from "./writeCustomerRowsInPostgres";
import { writeCustomerRowsThroughWorker } from "./writeCustomerRowsThroughWorker";
import {
	planHasPostgresOnlyRows,
	writePostgresOnlyRows,
} from "./writePostgresOnlyRows";

export type WrittenPlanRows = AutumnBillingPlanResult & {
	/** Seat transitions whose pool rows committed; empty when nothing was written. */
	pendingBatchTransitions: PendingBatchTransition[];
	/** The worker sized the plan's purchases with its rows; otherwise Postgres applies them after. */
	rebalancesApplied: boolean;
};

/** Rollout off: both steps in one transaction, as the plan always landed. */
const writePlanRowsInPostgres = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<WrittenPlanRows> => {
	const { data, error } = await tryCatch(
		withPlanTransaction({
			ctx,
			run: async (transactionCtx) => {
				const customerRows = await writeCustomerRowsInPostgres({
					ctx: transactionCtx,
					autumnBillingPlan,
				});
				if (customerRows.status === "customer_exists")
					return {
						...customerRows,
						pendingBatchTransitions: [],
						rebalancesApplied: false,
					};
				const pendingBatchTransitions = await writePostgresOnlyRows({
					ctx: transactionCtx,
					autumnBillingPlan,
				});
				return {
					...customerRows,
					pendingBatchTransitions,
					rebalancesApplied: false,
				};
			},
		}),
	);
	if (!error) return data;
	// A concurrent insert of the same customer committed first.
	if (autumnBillingPlan.insertCustomer && isUniqueConstraintError(error))
		return {
			status: "customer_exists",
			pendingBatchTransitions: [],
			rebalancesApplied: false,
		};
	throw error;
};

/** Through the worker: its rows first, then the Postgres-only rows as a second write. */
const writePlanRowsThroughWorker = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<WrittenPlanRows> => {
	const customerRows = await writeCustomerRowsThroughWorker({
		ctx,
		autumnBillingPlan,
	});
	if (customerRows.status === "customer_exists")
		return { ...customerRows, pendingBatchTransitions: [] };
	if (!planHasPostgresOnlyRows({ autumnBillingPlan }))
		return { ...customerRows, pendingBatchTransitions: [] };
	const pendingBatchTransitions = await withPlanTransaction({
		ctx,
		run: (transactionCtx) =>
			writePostgresOnlyRows({ ctx: transactionCtx, autumnBillingPlan }),
	});
	return { ...customerRows, pendingBatchTransitions };
};

/** The customer's rows, then the rows only Postgres holds: through the worker when it holds the customer, else one transaction. */
export const writePlanRows = ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<WrittenPlanRows> =>
	billingPlanRoutesToWorker({ autumnBillingPlan })
		? writePlanRowsThroughWorker({ ctx, autumnBillingPlan })
		: writePlanRowsInPostgres({ ctx, autumnBillingPlan });
