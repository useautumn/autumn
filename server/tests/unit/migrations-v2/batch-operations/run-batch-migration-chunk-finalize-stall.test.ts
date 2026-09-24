/** Regression: a committed page whose deferred cache invalidation never
 * settles must not park the whole chunk until trigger's maxDuration kills it. */

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { MigrationRuntimeWithEventId } from "@/internal/migrations/v2/types/migrationDefinition.js";

const claimModulePath =
	"@/internal/migrations/v2/batchOperations/execute/claim/index.js";
const executeModulePath =
	"@/internal/migrations/v2/batchOperations/execute/executeBatchMigrationPage.js";
const invalidateModulePath =
	"@/internal/migrations/v2/batchOperations/finalize/invalidateBatchMigrationCaches.js";
const emitEventsModulePath =
	"@/internal/migrations/v2/batchOperations/finalize/emitBatchMigrationItemEvents.js";
const cancelTokenModulePath =
	"@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";

// Snapshot spreads, not live namespaces — see webhook-delivery-concurrency.
const realClaim = { ...(await import(claimModulePath)) };
const realExecute = { ...(await import(executeModulePath)) };
const realInvalidate = { ...(await import(invalidateModulePath)) };
const realEmitEvents = { ...(await import(emitEventsModulePath)) };
const realCancelToken = { ...(await import(cancelTokenModulePath)) };

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};
const createDeferred = <T>(): Deferred<T> => {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

const PAGE_SIZE = 5;

type Scenario = {
	pages: BatchMigrationPageCustomer[][];
	/** Customers per page the executor reports as already converged. */
	skippedPerPage: number;
	/** Per page (1-based): how the deferred cache invalidation behaves. */
	invalidation: (page: number) => Promise<number>;
	/** Per page (1-based): resolves when the page's mutations may commit. */
	execution: (page: number) => Promise<void>;
	executedPages: number[];
	invalidationStarts: number[];
	invalidationCustomers: Map<number, string[]>;
	revokedIds: string[];
	/** Simulates a dead Postgres socket under the checkpoint writes. */
	checkpointWritesHang: boolean;
};

let scenario: Scenario;

const buildCustomers = ({
	page,
	count,
}: {
	page: number;
	count: number;
}): BatchMigrationPageCustomer[] =>
	Array.from({ length: count }, (_, index) => ({
		internalId: `cus_internal_p${page}_${index}`,
		id: `cus_p${page}_${index}`,
		name: null,
		email: null,
	}));

const pageOf = (customers: BatchMigrationPageCustomer[]) => {
	const match = /_p(\d+)_/.exec(customers[0]?.internalId ?? "");
	return match ? Number(match[1]) : 0;
};

mock.module(claimModulePath, () => ({
	...realClaim,
	claimNextBatchMigrationPage: async ({
		afterInternalId,
	}: {
		afterInternalId?: string;
	}) => {
		const nextIndex = afterInternalId
			? Number(afterInternalId.replace("cursor_", ""))
			: 0;
		const customers = scenario.pages[nextIndex];
		if (!customers)
			return { selectedCount: 0, cursor: afterInternalId, customers: [] };
		return {
			selectedCount: customers.length,
			cursor: `cursor_${nextIndex + 1}`,
			customers,
		};
	},
	markPageItemRuns: async () => {},
	failPageItemRuns: async ({
		internalCustomerIds,
	}: {
		internalCustomerIds: string[];
	}) => {
		scenario.revokedIds.push(...internalCustomerIds);
		return internalCustomerIds.length;
	},
}));

mock.module(executeModulePath, () => ({
	executeBatchMigrationPage: async ({
		customers,
	}: {
		customers: BatchMigrationPageCustomer[];
	}): Promise<BatchMigrationPageResult> => {
		const page = pageOf(customers);
		await scenario.execution(page);
		scenario.executedPages.push(page);
		const succeededCount = customers.length - scenario.skippedPerPage;
		return {
			succeeded: customers.slice(0, succeededCount),
			skipped: customers.slice(succeededCount),
			insertedItems: [],
			removedItems: [],
			repointedProducts: [],
		};
	},
}));

mock.module(invalidateModulePath, () => ({
	invalidateBatchMigrationCaches: async ({
		pageResult,
	}: {
		pageResult: BatchMigrationPageResult;
	}) => {
		const page = pageOf(pageResult.succeeded);
		scenario.invalidationStarts.push(page);
		scenario.invalidationCustomers.set(
			page,
			[...pageResult.succeeded, ...pageResult.skipped].map(
				(customer) => customer.internalId,
			),
		);
		return scenario.invalidation(page);
	},
}));

mock.module(emitEventsModulePath, () => ({
	emitBatchMigrationItemEvents: async ({
		pageResult,
	}: {
		pageResult: BatchMigrationPageResult;
	}) => ({ eventCount: pageResult.succeeded.length }),
}));

mock.module(cancelTokenModulePath, () => ({
	...realCancelToken,
	isMigrationCancelRequested: async () => false,
}));

const { BatchMigrationStallError, runBatchMigrationChunk } = await import(
	"@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js"
);

afterAll(() => {
	mock.module(claimModulePath, () => realClaim);
	mock.module(executeModulePath, () => realExecute);
	mock.module(invalidateModulePath, () => realInvalidate);
	mock.module(emitEventsModulePath, () => realEmitEvents);
	mock.module(cancelTokenModulePath, () => realCancelToken);
});

type LogLine = {
	level: string;
	message: string;
	data?: Record<string, unknown>;
};
let logs: LogLine[] = [];
const record =
	(level: string) =>
	(message: string, extra?: { data?: Record<string, unknown> }) => {
		logs.push({ level, message, data: extra?.data });
	};
const logger = {
	debug: () => {},
	info: record("info"),
	warn: record("warn"),
	error: record("error"),
};

// withStatementTimeout wraps the checkpoint writes in a transaction.
const fakeTransaction = { execute: async () => [] };
const ctx = {
	org: { id: "org_test", slug: "genie", redis_config: null },
	env: "live",
	features: [],
	logger,
	db: {
		transaction: (fn: (tx: unknown) => Promise<unknown>) =>
			scenario.checkpointWritesHang
				? new Promise<never>(() => {})
				: fn(fakeTransaction),
	},
	// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for the chunk loop
} as any;

const migration = {
	internal_id: "mig_internal_test",
	id: "free-update-709",
	filter: undefined,
} as unknown as MigrationRuntimeWithEventId;

const plan = { patches: [] } as unknown as BatchMigrationExecutionPlan;

const setScenario = ({
	pageCount,
	invalidation,
	execution = async () => {},
	skippedPerPage = 0,
	checkpointWritesHang = false,
}: {
	pageCount: number;
	invalidation: Scenario["invalidation"];
	execution?: Scenario["execution"];
	skippedPerPage?: number;
	checkpointWritesHang?: boolean;
}) => {
	scenario = {
		pages: Array.from({ length: pageCount }, (_, index) =>
			buildCustomers({ page: index + 1, count: PAGE_SIZE }),
		),
		skippedPerPage,
		invalidation,
		execution,
		executedPages: [],
		invalidationStarts: [],
		invalidationCustomers: new Map(),
		revokedIds: [],
		checkpointWritesHang,
	};
};

// Small budgets so a stall surfaces in milliseconds instead of minutes.
const timeouts = {
	deferredOperationMs: 200,
	pageMs: 600,
	stallLogMs: 50,
	recoveryWriteMs: 150,
	finalizeReserveMs: 100,
	minPageBudgetMs: 400,
};

const runChunk = ({
	controls,
	deadlineAt,
	pageMs,
}: {
	controls?: { retryItemStatuses: ("failed" | "skipped")[] };
	deadlineAt?: number;
	pageMs?: number;
} = {}) =>
	runBatchMigrationChunk({
		ctx,
		migration,
		migrationRunId: "mrun_test",
		plan,
		maxPages: 20,
		controls,
		deadlineAt,
		timeouts: { ...timeouts, pageMs: pageMs ?? timeouts.pageMs },
	});

type Settled =
	| { kind: "resolved"; result: Awaited<ReturnType<typeof runChunk>> }
	| { kind: "rejected"; error: unknown };
const settle = (promise: ReturnType<typeof runChunk>): Promise<Settled> =>
	promise.then(
		(result) => ({ kind: "resolved", result }),
		(error: unknown) => ({ kind: "rejected", error }),
	);

const STUCK = Symbol("stuck");
const raceWithDeadline = async <T>({
	promise,
	ms,
}: {
	promise: Promise<T>;
	ms: number;
}): Promise<T | typeof STUCK> =>
	Promise.race([
		promise,
		new Promise<typeof STUCK>((resolve) =>
			setTimeout(() => resolve(STUCK), ms),
		),
	]);

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
	unhandled.push(reason);
};

beforeEach(() => {
	logs = [];
	unhandled.length = 0;
	process.on("unhandledRejection", onUnhandled);
});
afterEach(async () => {
	// Let any late rejection from an abandoned op reach the process hook.
	await sleep(20);
	process.off("unhandledRejection", onUnhandled);
	expect(unhandled).toEqual([]);
});

const expectStall = ({
	outcome,
	phase,
}: {
	outcome: Settled | typeof STUCK;
	phase: string;
}) => {
	expect(outcome).not.toBe(STUCK);
	const settled = outcome as Settled;
	expect(settled.kind).toBe("rejected");
	const error = (settled as { error: unknown }).error;
	expect(error).toBeInstanceOf(BatchMigrationStallError);
	expect((error as InstanceType<typeof BatchMigrationStallError>).phase).toBe(
		phase,
	);
	return error as InstanceType<typeof BatchMigrationStallError>;
};

describe("runBatchMigrationChunk — deferred finalization that never settles", () => {
	test("a single page whose cache invalidation never resolves does not park the chunk in drain()", async () => {
		const never = createDeferred<number>();
		setScenario({ pageCount: 1, invalidation: () => never.promise });

		const outcome = await raceWithDeadline({
			promise: settle(runChunk()),
			ms: 1_500,
		});

		// The page's marks committed (execute ran) — the caller must still get
		// an answer, and it must name the phase that stalled.
		expect(scenario.executedPages).toEqual([1]);
		expect(scenario.invalidationStarts).toEqual([1]);
		const error = expectStall({ outcome, phase: "finalize_caches" });
		expect(error.message).toContain("page 1");
		expect(error.message).toContain("1 timed out");
		expect(
			logs.some((line) => line.message === "batch-migration: chunk finished"),
		).toBe(false);

		// The stalled page's checkpoints are revoked so a retry re-claims them.
		expect(scenario.revokedIds.sort()).toEqual(
			[...(scenario.invalidationCustomers.get(1) ?? [])].sort(),
		);
		expect(
			logs.some(
				(line) =>
					line.level === "error" &&
					line.message ===
						"batch-migration: deferred finalize_caches_drain timed out" &&
					line.data?.label === "page 1",
			),
		).toBe(true);

		never.resolve(PAGE_SIZE);
	});

	test("three pages with unresolved cache invalidations do not park the chunk in settle()", async () => {
		const never = createDeferred<number>();
		setScenario({ pageCount: 4, invalidation: () => never.promise });

		const outcome = await raceWithDeadline({
			promise: settle(runChunk()),
			ms: 2_500,
		});

		// The settle() cap no longer blocks page 4 forever: every page commits,
		// then the chunk fails naming the stalled finalization.
		expect(scenario.executedPages).toEqual([1, 2, 3, 4]);
		const error = expectStall({ outcome, phase: "finalize_caches" });
		expect(error.message).toContain("4 page(s)");

		never.resolve(PAGE_SIZE);
	});

	test("only the stalled page loses its checkpoint; the other pages stay succeeded", async () => {
		const never = createDeferred<number>();
		setScenario({
			pageCount: 4,
			invalidation: (page) =>
				page === 3 ? never.promise : Promise.resolve(PAGE_SIZE),
		});

		const outcome = await raceWithDeadline({
			promise: settle(runChunk()),
			ms: 2_500,
		});

		const error = expectStall({ outcome, phase: "finalize_caches" });
		expect(error.message).toContain("page 3");
		expect(scenario.executedPages).toEqual([1, 2, 3, 4]);
		expect(scenario.revokedIds.sort()).toEqual(
			[...(scenario.invalidationCustomers.get(3) ?? [])].sort(),
		);

		never.resolve(PAGE_SIZE);
	});

	test("on a retry run a stalled page also revokes its converged (skipped) customers", async () => {
		const never = createDeferred<number>();
		setScenario({
			pageCount: 1,
			invalidation: () => never.promise,
			skippedPerPage: 2,
		});

		const outcome = await raceWithDeadline({
			promise: settle(
				runChunk({ controls: { retryItemStatuses: ["failed"] } }),
			),
			ms: 1_500,
		});

		expectStall({ outcome, phase: "finalize_caches" });
		const pageIds =
			scenario.pages[0]?.map((customer) => customer.internalId) ?? [];
		expect(scenario.invalidationCustomers.get(1)?.sort()).toEqual(
			[...pageIds].sort(),
		);
		expect(scenario.revokedIds.sort()).toEqual([...pageIds].sort());

		never.resolve(PAGE_SIZE);
	});

	test("a rejection that arrives after the deadline is captured, never unhandled", async () => {
		const late = createDeferred<number>();
		setScenario({ pageCount: 1, invalidation: () => late.promise });

		const outcome = await raceWithDeadline({
			promise: settle(runChunk()),
			ms: 1_500,
		});
		expectStall({ outcome, phase: "finalize_caches" });

		late.reject(new Error("redis gave up after the chunk moved on"));
		// afterEach asserts no unhandledRejection reached the process.
	});

	test("a page whose own work stalls fails with the stalled stage and logs progress", async () => {
		const never = createDeferred<void>();
		setScenario({
			pageCount: 3,
			invalidation: () => Promise.resolve(PAGE_SIZE),
			execution: (page) => (page === 2 ? never.promise : Promise.resolve()),
		});

		const outcome = await raceWithDeadline({
			promise: settle(runChunk()),
			ms: 2_500,
		});

		const error = expectStall({ outcome, phase: "page_execute" });
		expect(error.message).toContain("page 2 made no progress");
		expect(scenario.executedPages).toEqual([1]);
		// The abandoned page's claims are failed so its late marks cannot
		// resurrect them as succeeded behind the retry's back.
		expect(scenario.revokedIds.sort()).toEqual(
			[
				...(scenario.pages[1]?.map((customer) => customer.internalId) ?? []),
			].sort(),
		);

		const stalled = logs.filter(
			(line) => line.message === "batch-migration: chunk stalled",
		);
		expect(stalled.length).toBeGreaterThan(0);
		expect(stalled[0]?.data).toMatchObject({ page: 2, stage: "execute" });
		expect(
			logs.some((line) => line.message === "batch-migration: page stalled"),
		).toBe(true);

		never.resolve();
	});

	test("a hung checkpoint write during recovery cannot re-stall the chunk", async () => {
		const never = createDeferred<number>();
		setScenario({
			pageCount: 1,
			invalidation: () => never.promise,
			checkpointWritesHang: true,
		});

		const outcome = await raceWithDeadline({
			promise: settle(runChunk()),
			ms: 1_500,
		});

		expectStall({ outcome, phase: "finalize_caches" });
		expect(scenario.revokedIds).toEqual([]);
		expect(
			logs.some(
				(line) =>
					line.level === "error" &&
					line.message.includes("checkpoint revoke failed") &&
					String(line.data?.revokeError).includes("no answer from Postgres"),
			),
		).toBe(true);

		never.resolve(PAGE_SIZE);
	});

	test("yields slice_complete instead of starting a page the chunk deadline cannot fit", async () => {
		setScenario({
			pageCount: 5,
			invalidation: () => Promise.resolve(PAGE_SIZE),
			execution: () => sleep(200),
		});

		// reserve 100 + min page budget 400 leaves room for one ~200ms page.
		const result = await runChunk({ deadlineAt: Date.now() + 550 });

		expect(result.completion).toBe("slice_complete");
		expect(result.cursor).toBe("cursor_1");
		expect(scenario.executedPages).toEqual([1]);
		expect(
			logs.some(
				(line) =>
					line.message === "batch-migration: chunk yielding before deadline",
			),
		).toBe(true);
	});

	test("a page budget is clipped to the chunk deadline, not just the page timeout", async () => {
		const never = createDeferred<void>();
		setScenario({
			pageCount: 2,
			invalidation: () => Promise.resolve(PAGE_SIZE),
			execution: (page) => (page === 1 ? never.promise : Promise.resolve()),
		});

		// The page timeout alone (5s) would outlive the deadline; the reserve
		// leaves this page ~500ms.
		const startedAt = Date.now();
		const outcome = await raceWithDeadline({
			promise: settle(
				runChunk({ deadlineAt: Date.now() + 600, pageMs: 5_000 }),
			),
			ms: 3_000,
		});

		expectStall({ outcome, phase: "page_execute" });
		expect(Date.now() - startedAt).toBeLessThan(2_000);

		never.resolve();
	});

	test("healthy finalization still drains before the chunk returns", async () => {
		const completed: number[] = [];
		setScenario({
			pageCount: 2,
			invalidation: async (page) => {
				await sleep(60);
				completed.push(page);
				return PAGE_SIZE;
			},
		});

		const result = await runChunk();

		expect(result.completion).toBe("exhausted");
		expect(result.processed).toBe(2 * PAGE_SIZE);
		expect(completed.sort()).toEqual([1, 2]);
		expect(scenario.revokedIds).toEqual([]);
		// "finished" is logged only once the deferred work has drained.
		const finished = logs.find(
			(line) => line.message === "batch-migration: chunk finished",
		);
		expect(finished?.data).toMatchObject({ completion: "exhausted" });
		expect(
			logs.some((line) => line.message === "batch-migration: chunk stalled"),
		).toBe(false);
	});
});
