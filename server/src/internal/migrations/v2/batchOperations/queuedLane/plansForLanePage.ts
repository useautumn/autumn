import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import { removeCandidatesToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsThroughWorker/removeCandidatesToMigrationPlan.js";
import { selectPatchRemoveCandidates } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsThroughWorker/selectPatchRemoveCandidates.js";
import { replaceRowsToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsThroughWorker/replaceRowsToMigrationPlan.js";
import { selectPatchReplaceRows } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsThroughWorker/selectPatchReplaceRows.js";
import { isHeldByWorker } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/isHeldByWorker.js";
import type { HeldRow } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/types/heldRow.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { QueuedLaneScenario } from "./types/queuedLane.js";

const rowsByCustomerOf = <Row extends { internalCustomerId: string }>({
	rows,
}: {
	rows: Row[];
}): Map<string, Row[]> => {
	const byCustomer = new Map<string, Row[]>();
	for (const row of rows) {
		const list = byCustomer.get(row.internalCustomerId) ?? [];
		list.push(row);
		byCustomer.set(row.internalCustomerId, list);
	}
	return byCustomer;
};

const addPlans = <Row extends HeldRow>({
	plans,
	rows,
	toPlan,
}: {
	plans: Map<string, WorkerMigrationPlan>;
	rows: Row[];
	toPlan: ({ rows }: { rows: Row[] }) => WorkerMigrationPlan;
}): void => {
	for (const [internalCustomerId, customerRows] of rowsByCustomerOf({ rows })) {
		if (plans.has(internalCustomerId))
			throw new Error("The queued lane plans one phase per customer");
		plans.set(internalCustomerId, toPlan({ rows: customerRows }));
	}
};

export const plansForLanePage = async ({
	ctx,
	scenario,
	plan,
	customers,
}: {
	ctx: AutumnContext;
	scenario: QueuedLaneScenario;
	plan: BatchMigrationExecutionPlan;
	customers: RoutedPageCustomer[];
}): Promise<{
	plans: Map<string, WorkerMigrationPlan>;
	candidatesMs: number;
}> => {
	const internalCustomerIds = customers.map(({ internalId }) => internalId);
	const plans = new Map<string, WorkerMigrationPlan>();
	let candidatesMs = 0;
	for (const patch of plan.patches) {
		const startedAt = Date.now();
		if (scenario === "remove") {
			const rows = await selectPatchRemoveCandidates({
				ctx,
				patch,
				internalCustomerIds,
			});
			candidatesMs += Date.now() - startedAt;
			addPlans({
				plans,
				rows: rows.filter((row) => isHeldByWorker({ row })),
				toPlan: removeCandidatesToMigrationPlan,
			});
			continue;
		}
		const { rows } = await selectPatchReplaceRows({
			ctx,
			patch,
			internalCustomerIds,
			now: Date.now(),
		});
		candidatesMs += Date.now() - startedAt;
		addPlans({
			plans,
			rows: rows.filter((row) => isHeldByWorker({ row })),
			toPlan: replaceRowsToMigrationPlan,
		});
	}
	return { plans, candidatesMs };
};
