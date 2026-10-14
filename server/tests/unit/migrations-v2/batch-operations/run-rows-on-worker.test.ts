import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanRequest,
	toBillingPlanDeleteOp,
} from "@autumn/balance-engine";
import {
	type ApplyBillingPlanReply,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { CusProductStatus } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { runRowsOnWorker } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/runRowsOnWorker.js";
import type { HeldRow } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/types/heldRow.js";
import { BatchMigrationWorkerUnavailableError } from "@/internal/migrations/v2/batchOperations/execute/errors/batchMigrationErrors.js";
import { BATCH_MIGRATION_WORKER_UNAVAILABLE_LIMIT } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";

const ctx = {
	...contexts.create({}),
	id: "req_migration",
	timestamp: 1_700_000_000_000,
};

type Row = HeldRow & { grantId: string };

const customerOf = (index: number) => ({
	internalId: `cus_internal_${index}`,
	id: `customer_${index}`,
	name: null,
	email: null,
});

const rowOf = (index: number, overrides: Partial<Row> = {}): Row => ({
	internalCustomerId: `cus_internal_${index}`,
	ownerInternalEntityId: null,
	ownerEntityId: null,
	status: CusProductStatus.Active,
	internalProductId: "prod_internal_free",
	productIsCustom: false,
	customerPriceIds: [],
	grantId: `grant_${index}`,
	...overrides,
});

const applied = (): ApplyBillingPlanReply =>
	({
		result: { status: "applied" },
		state: { customer: { internal_id: "cus_internal_1" } },
		catalog: {},
	}) as unknown as ApplyBillingPlanReply;

const stale = () =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "stale",
		workerCode: "STALE_SUBJECT",
	});

const unreachable = () =>
	new BalanceWorkerClientError({
		code: "TRANSPORT",
		outcome: "not_submitted",
		message: "connection refused",
	});

const clientAnswering = (answer: () => ApplyBillingPlanReply) => ({
	applyBillingPlan: async (_: { request: ApplyBillingPlanRequest }) => answer(),
});

const toPlan = ({ rows }: { rows: Row[] }) => ({
	entityIds: [],
	ops: rows.map(({ grantId }) =>
		toBillingPlanDeleteOp({ table: "customerEntitlements", id: grantId }),
	),
	catalogRows: [],
});

describe("runRowsOnWorker", () => {
	test("a re-select that finds a row the worker can't hold sends the customer to the SQL path, never drops the row", async () => {
		const result = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: [customerOf(1)],
			rows: [rowOf(1)],
			toPlan,
			reselect: async () => [rowOf(1, { status: CusProductStatus.Paused })],
			client: clientAnswering(() => {
				throw stale();
			}),
		});
		expect(result).toEqual({
			appliedRows: [],
			fallbackInternalCustomerIds: ["cus_internal_1"],
			failureReasons: {},
		});
	});

	test("customers with no rows are never sent", async () => {
		let sends = 0;
		const result = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: [customerOf(1), customerOf(2)],
			rows: [rowOf(1)],
			toPlan,
			reselect: async () => [],
			client: clientAnswering(() => {
				sends += 1;
				return applied();
			}),
		});
		expect(sends).toBe(1);
		expect(result.appliedRows.map(({ grantId }) => grantId)).toEqual([
			"grant_1",
		]);
	});

	test("a worker that's unreachable for every customer aborts the run", async () => {
		const count = BATCH_MIGRATION_WORKER_UNAVAILABLE_LIMIT + 5;
		const indexes = Array.from({ length: count }, (_, index) => index);
		const error = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: indexes.map(customerOf),
			rows: indexes.map((index) => rowOf(index)),
			toPlan,
			reselect: async () => [],
			client: clientAnswering(() => {
				throw unreachable();
			}),
		}).catch((cause: unknown) => cause);
		expect(error).toBeInstanceOf(BatchMigrationWorkerUnavailableError);
	});

	test("a few unreachable customers between successes fail alone", async () => {
		let sends = 0;
		const result = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: [customerOf(1), customerOf(2)],
			rows: [rowOf(1), rowOf(2)],
			toPlan,
			reselect: async () => [],
			client: clientAnswering(() => {
				sends += 1;
				if (sends === 1) throw unreachable();
				return applied();
			}),
		});
		expect(Object.keys(result.failureReasons)).toHaveLength(1);
		expect(result.appliedRows).toHaveLength(1);
	});
});
