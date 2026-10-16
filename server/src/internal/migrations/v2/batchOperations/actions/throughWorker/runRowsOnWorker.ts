import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import { BATCH_MIGRATION_WORKER_SEND_CONCURRENCY } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { applyCustomerRowsOnWorker } from "./applyCustomerRowsOnWorker.js";
import { isHeldByWorker } from "./isHeldByWorker.js";
import type { HeldRow } from "./types/heldRow.js";
import type { WorkerPageGate } from "./types/workerPageGate.js";

export type RowsOnWorkerResult<Row> = {
	appliedRows: Row[];
	fallbackInternalCustomerIds: string[];
	failureReasons: Record<string, string>;
};

const rowsByCustomerOf = <Row extends { internalCustomerId: string }>({
	rows,
}: {
	rows: Row[];
}): Map<string, Row[]> => {
	const rowsByCustomer = new Map<string, Row[]>();
	for (const row of rows) {
		const customerRows = rowsByCustomer.get(row.internalCustomerId) ?? [];
		customerRows.push(row);
		rowsByCustomer.set(row.internalCustomerId, customerRows);
	}
	return rowsByCustomer;
};

export const runRowsOnWorker = async <Row extends HeldRow>({
	ctx,
	migrationRunId,
	commandScope,
	customers,
	rows,
	toPlan,
	reselect,
	gate,
	retryDelaysMs,
	client,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	commandScope: string;
	customers: RoutedPageCustomer[];
	rows: Row[];
	toPlan: ({ rows }: { rows: Row[] }) => WorkerMigrationPlan;
	reselect: ({ customer }: { customer: RoutedPageCustomer }) => Promise<Row[]>;
	gate: WorkerPageGate;
	retryDelaysMs?: number[];
	client?: Pick<BalanceWorkerClient, "applyBillingPlan">;
}): Promise<RowsOnWorkerResult<Row>> => {
	const rowsByCustomer = rowsByCustomerOf({ rows });
	const customersWithRows = customers.filter(({ internalId }) =>
		rowsByCustomer.has(internalId),
	);

	const outcomes = await mapWithConcurrency({
		items: customersWithRows,
		concurrency: BATCH_MIGRATION_WORKER_SEND_CONCURRENCY,
		run: async (customer) => {
			const outcome = await applyCustomerRowsOnWorker({
				ctx,
				customer,
				rows: rowsByCustomer.get(customer.internalId) ?? [],
				toPlan,
				reselect: async () => {
					const freshRows = await reselect({ customer });
					const allHeld = freshRows.every((row) => isHeldByWorker({ row }));
					return allHeld ? freshRows : null;
				},
				signal: gate.signal,
				retryDelaysMs,
				client,
			});
			gate.recordOutcome({
				unavailable: outcome.status === "failed" && outcome.unavailable,
			});
			return { customer, outcome };
		},
	});

	const appliedRows: Row[] = [];
	const fallbackInternalCustomerIds: string[] = [];
	const failureReasons: Record<string, string> = {};
	for (const { customer, outcome } of outcomes) {
		if (outcome.status === "applied") {
			appliedRows.push(...outcome.rows);
			continue;
		}
		if (outcome.status === "fallback") {
			fallbackInternalCustomerIds.push(customer.internalId);
			ctx.logger.warn("batch-migration: worker write falling back to SQL", {
				data: {
					migrationRunId,
					commandScope,
					internalCustomerId: customer.internalId,
					reason: outcome.reason,
				},
			});
			continue;
		}
		failureReasons[customer.internalId] = outcome.reason;
		ctx.logger.warn("batch-migration: worker write failed", {
			data: {
				migrationRunId,
				commandScope,
				internalCustomerId: customer.internalId,
				reason: outcome.reason,
			},
		});
	}
	return { appliedRows, fallbackInternalCustomerIds, failureReasons };
};
