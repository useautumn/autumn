import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveInternalProductIdForEvent } from "@/internal/balances/events/resolveInternalProductIdForEvent.js";
import { executePostgresDeductionV2 } from "@/internal/balances/utils/deductionV2/executePostgresDeductionV2.js";
import { projectMutationLogsToTrackDeductionsV2 } from "@/internal/balances/utils/deductionV2/projectMutationLogsToTrackDeductionsV2.js";
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

	const result = await executePostgresDeductionV2({
		ctx,
		fullSubject,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
		deductions: [deduction],
		options: deductionOptions,
	});

	const { fullSubject: updatedFullSubject, mutationLogs } = result;

	const deductions = projectMutationLogsToTrackDeductionsV2({
		fullSubject: updatedFullSubject,
		mutationLogs,
	});

	const internalProductId = resolveInternalProductIdForEvent({
		fullSubject: updatedFullSubject,
		mutationLogs,
	});

	insertFinalizeLockEventV2({
		ctx,
		finalizeLockContext,
		deductions,
		internalProductId,
	});
};
