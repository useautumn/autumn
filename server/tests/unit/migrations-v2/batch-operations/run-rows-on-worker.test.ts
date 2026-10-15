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
import { createWorkerPageGate } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/createWorkerPageGate.js";
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
	productLoadedByWorker: true,
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

const activeGate = () =>
	createWorkerPageGate({ signal: new AbortController().signal });

const fencedGate = (controller: AbortController) =>
	createWorkerPageGate({ signal: controller.signal });

const notReady = () =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "activating",
		workerCode: "NOT_READY",
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
			reselect: async () => [
				rowOf(1, {
					status: CusProductStatus.Paused,
					productLoadedByWorker: false,
				}),
			],
			gate: activeGate(),
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
			gate: activeGate(),
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
			gate: activeGate(),
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
			gate: activeGate(),
			client: clientAnswering(() => {
				sends += 1;
				if (sends === 1) throw unreachable();
				return applied();
			}),
		});
		expect(Object.keys(result.failureReasons)).toHaveLength(1);
		expect(result.appliedRows).toHaveLength(1);
	});

	test("a page fenced before its sends reaches no worker", async () => {
		const controller = new AbortController();
		controller.abort(new Error("page stalled"));
		let sends = 0;
		const error = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: [customerOf(1), customerOf(2)],
			rows: [rowOf(1), rowOf(2)],
			toPlan,
			reselect: async () => [rowOf(1)],
			gate: fencedGate(controller),
			client: clientAnswering(() => {
				sends += 1;
				return applied();
			}),
		}).catch((cause: unknown) => cause);
		expect(sends).toBe(0);
		expect((error as Error).message).toBe("page stalled");
	});

	test("a page fenced while a customer is in flight sends that customer nothing more", async () => {
		const controller = new AbortController();
		let sends = 0;
		const error = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: [customerOf(1)],
			rows: [rowOf(1)],
			toPlan,
			reselect: async () => [rowOf(1)],
			gate: fencedGate(controller),
			client: clientAnswering(() => {
				sends += 1;
				controller.abort(new Error("page stalled"));
				throw stale();
			}),
		}).catch((cause: unknown) => cause);
		expect(sends).toBe(1);
		expect((error as Error).message).toBe("page stalled");
	});

	test("a worker still activating is sent again after a backoff, and lands", async () => {
		let sends = 0;
		const result = await runRowsOnWorker({
			ctx,
			migrationRunId: "mrun_1",
			commandScope: "0_remove",
			customers: [customerOf(1)],
			rows: [rowOf(1)],
			toPlan,
			reselect: async () => [],
			gate: activeGate(),
			retryDelaysMs: [0, 0],
			client: clientAnswering(() => {
				sends += 1;
				if (sends < 3) throw notReady();
				return applied();
			}),
		});
		expect(sends).toBe(3);
		expect(result.appliedRows.map(({ grantId }) => grantId)).toEqual([
			"grant_1",
		]);
		expect(result.failureReasons).toEqual({});
	});

	test("unreachable customers count toward the abort across the page's phases", async () => {
		const gate = activeGate();
		const unreachableClient = clientAnswering(() => {
			throw unreachable();
		});
		const phase = (indexes: number[]) =>
			runRowsOnWorker({
				ctx,
				migrationRunId: "mrun_1",
				commandScope: "0_remove",
				customers: indexes.map(customerOf),
				rows: indexes.map((index) => rowOf(index)),
				toPlan,
				reselect: async () => [],
				gate,
				client: unreachableClient,
			});
		const firstPhase = Array.from(
			{ length: BATCH_MIGRATION_WORKER_UNAVAILABLE_LIMIT - 1 },
			(_, index) => index,
		);
		const result = await phase(firstPhase);
		expect(Object.keys(result.failureReasons)).toHaveLength(firstPhase.length);
		const error = await phase([firstPhase.length]).catch(
			(cause: unknown) => cause,
		);
		expect(error).toBeInstanceOf(BatchMigrationWorkerUnavailableError);
	});
});
