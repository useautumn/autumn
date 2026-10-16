import { parseApplyBillingPlanRequest } from "@autumn/balance-engine";
import type { MigrationRecord } from "@autumn/balance-worker-client";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import { generateId } from "@/utils/genUtils.js";

export const laneRecordOf = ({
	ctx,
	customer,
	plan,
	migrationInternalId,
	migrationRunId,
	forceColdRollback = false,
}: {
	ctx: AutumnContext;
	customer: RoutedPageCustomer;
	plan: WorkerMigrationPlan;
	migrationInternalId: string;
	migrationRunId: string;
	forceColdRollback?: boolean;
}): MigrationRecord => {
	const request = parseApplyBillingPlanRequest({
		input: {
			command: {
				...requestContextToCommandBase({ ctx, customerId: customer.id }),
				type: "applyBillingPlan",
				commandId: generateId("mig"),
				entityIds: plan.entityIds,
				ops: plan.ops,
			},
			catalogRows: plan.catalogRows,
		},
	});
	return {
		identity: request.command.identity,
		value: JSON.stringify({
			request,
			migrationInternalId,
			migrationRunId,
			internalCustomerId: customer.internalId,
			producedAt: Date.now(),
			...(forceColdRollback && { forceColdRollback }),
		}),
	};
};
