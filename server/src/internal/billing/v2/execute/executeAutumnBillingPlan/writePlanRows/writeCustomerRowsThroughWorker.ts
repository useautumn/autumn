import {
	type AutumnBillingPlan,
	InternalError,
	tryCatch,
} from "@autumn/shared";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isBalanceWorkerStaleSubjectError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { applyBillingPlanOnWorker } from "@/internal/balanceWorker/billingPlan/applyBillingPlanOnWorker";
import { billingPlanToWorkerCustomerId } from "@/internal/balanceWorker/billingPlan/routing/billingPlanToWorkerCustomerId";
import type { AutumnBillingPlanResult } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { markCustomerUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { claimCustomerByEmail } from "@/internal/customers/repos/claimCustomerByEmail/claimCustomerByEmail.js";
import { withPlanTransaction } from "./withPlanTransaction";
import { writeCustomerRowsInPostgres } from "./writeCustomerRowsInPostgres";

/** The worker keys on the customer's id, so an id-less row with the same email is claimed in Postgres first. */
const claimExistingCustomer = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<AutumnBillingPlanResult | null> => {
	const { insertCustomer } = autumnBillingPlan;
	if (!insertCustomer) return null;
	try {
		const internalCustomerId = await claimCustomerByEmail({
			ctx,
			customer: insertCustomer,
		});
		return internalCustomerId
			? { status: "customer_exists", internalCustomerId }
			: null;
	} catch (error) {
		// The id was taken while claiming: the customer exists under it.
		if (isUniqueConstraintError(error)) return { status: "customer_exists" };
		throw error;
	}
};

/** The rows the worker holds, as one worker mutation answered once Postgres holds them. */
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

	const claimed = await claimExistingCustomer({ ctx, autumnBillingPlan });
	if (claimed) return claimed;

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
	if (result.status === "customer_exists") return result;

	// Replica reads of this customer pin to the primary for a while, as after any structural write.
	await markCustomerUpdatedAt({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		internalCustomerId: result.internalCustomerId,
	});
	return result;
};
