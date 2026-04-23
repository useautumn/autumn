import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePostgresDeductionV2 } from "@/internal/balances/utils/deductionV2/executePostgresDeductionV2.js";
import type { FinalizeLockContextV2 } from "@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js";
import { insertFinalizeLockEventV2 } from "./insertFinalizeLockEventV2.js";

export const runPostgresFinalizeLockV2 = async ({
	ctx,
	finalizeLockContext,
}: {
	ctx: AutumnContext;
	finalizeLockContext: FinalizeLockContextV2;
}) => {
	const { receipt, fullSubject, deduction, deductionOptions } =
		finalizeLockContext;

	await executePostgresDeductionV2({
		ctx,
		fullSubject,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
		deductions: [deduction],
		options: deductionOptions,
	});

	insertFinalizeLockEventV2({ ctx, finalizeLockContext });
};
