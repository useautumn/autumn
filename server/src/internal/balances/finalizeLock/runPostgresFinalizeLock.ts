import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction.js";
import type { FinalizeLockContext } from "./buildFinalizeLockContext.js";
import { insertFinalizeLockEvent } from "./insertFinalizeLockEvent.js";

export const runPostgresFinalizeLock = async ({
	ctx,
	finalizeLockContext,
}: {
	ctx: AutumnContext;
	finalizeLockContext: FinalizeLockContext;
}) => {
	const {
		receipt,
		fullCustomer,
		finalValue,
		lockValue,
		deduction,
		deductionOptions,
	} = finalizeLockContext;

	await executePostgresDeduction({
		ctx,
		fullCustomer,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
		deductions: [deduction],
		options: deductionOptions,
	});

	insertFinalizeLockEvent({ ctx, finalizeLockContext });
};
