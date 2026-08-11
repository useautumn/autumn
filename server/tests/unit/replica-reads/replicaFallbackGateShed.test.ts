import { afterEach, describe, expect, it } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const primaryDb = { pool: "primary" } as unknown as DrizzleCli;
const generalDb = { pool: "general" } as unknown as DrizzleCli;
const replicaDb = { pool: "replica" } as unknown as DrizzleCli;
const quietLedgerDb = {
	execute: () => Promise.resolve([]),
} as unknown as DrizzleCli;

// Records which pool each hydration ran on — the whole no-primary-retry
// contract for gate sheds lives in that sequence.
const hydrationPools: string[] = [];
let executePreparedImpl: (args: { db: DrizzleCli }) => Promise<unknown[]> =
	() => Promise.resolve([]);

await mockModuleWithRestore("@/db/executePrepared.js", () => ({
	executePrepared: (args: { db: DrizzleCli }) => {
		hydrationPools.push((args.db as unknown as { pool: string }).pool);
		return executePreparedImpl(args);
	},
	preparedStatementNames: () => [],
}));

const { EXPECTED_REPLICA_COUNT } = await import(
	"@/db/probes/replicaLagProbe.js"
);
const {
	_resetReplicaRoutingStateForTesting,
	_setReplicaRoutingProbeForTesting,
} = await import("@/db/replicaRoutingState.js");
const { _setLedgerDbOverrideForTesting, _setReplicaDbOverrideForTesting } =
	await import("@/db/resolveSubjectReadDb.js");
const { getFullSubject } = await import(
	"@/internal/customers/repos/getFullSubject/getFullSubject.js"
);
const { _setFullSubjectGateEwmaForTesting } = await import(
	"@/internal/customers/repos/getFullSubject/getFullSubjectGate.js"
);
const { _resetRecentlyUpdatedNegativeCacheForTesting } = await import(
	"@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js"
);
const { _setFullSubjectGateConfigForTesting } = await import(
	"@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js"
);

const makeCtx = (): AutumnContext =>
	({
		db: primaryDb,
		dbGeneral: generalDb,
		org: { id: "org_gate_shed" },
		env: "sandbox",
		skipCache: true,
		logger: { info() {}, warn() {}, error() {}, debug() {} },
	}) as unknown as AutumnContext;

const makeReplicaEligible = () => {
	_setReplicaRoutingProbeForTesting({
		replicaCount: EXPECTED_REPLICA_COUNT,
		maxReplayLagMs: 0,
	});
	_setReplicaDbOverrideForTesting(replicaDb);
	_setLedgerDbOverrideForTesting(quietLedgerDb);
};

afterEach(() => {
	hydrationPools.length = 0;
	executePreparedImpl = () => Promise.resolve([]);
	_setReplicaDbOverrideForTesting(null);
	_setLedgerDbOverrideForTesting(null);
	_resetReplicaRoutingStateForTesting();
	_resetRecentlyUpdatedNegativeCacheForTesting();
	_setFullSubjectGateConfigForTesting({ config: {} });
	_setFullSubjectGateEwmaForTesting(100);
});

describe("replica fallback vs gate shed", () => {
	it("keeps ordinary FullSubject reads on the original primary pool", async () => {
		executePreparedImpl = async () => [];

		const result = await getFullSubject({
			ctx: makeCtx(),
			customerId: "cus_no_backup_read",
		});

		expect(result).toBeUndefined();
		expect(hydrationPools).toEqual(["primary"]);
	});

	it("honors the runtime kill switch for an opted-in caller", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				delayed_postgres_backup_read: {
					enabled: false,
					delay_ms: 10,
					max_in_flight_per_process: 1,
				},
			},
		});
		executePreparedImpl = async () => [];

		const result = await getFullSubject({
			ctx: makeCtx(),
			customerId: "cus_disabled_backup_read",
			useDelayedPostgresBackupRead: true,
		});

		expect(result).toBeUndefined();
		expect(hydrationPools).toEqual(["primary"]);
	});

	it("admits an opted-in backup independently when the primary lane limit is one", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				fleet_process_count: 1,
				delayed_postgres_backup_read: {
					enabled: true,
					delay_ms: 10,
					max_in_flight_per_process: 1,
				},
			},
		});

		let releasePrimary: () => void = () => {};
		const heldPrimary = new Promise<void>((resolve) => {
			releasePrimary = resolve;
		});
		executePreparedImpl = async ({ db }) => {
			if (db === primaryDb) await heldPrimary;
			return [];
		};

		const hydration = getFullSubject({
			ctx: makeCtx(),
			customerId: "cus_primary_backup_read",
			useDelayedPostgresBackupRead: true,
		});
		const outcome = await Promise.race([
			hydration,
			new Promise<"timed_out">((resolve) =>
				setTimeout(() => resolve("timed_out"), 75),
			),
		]);

		expect(outcome).toBeUndefined();
		expect(hydrationPools).toEqual(["primary", "general"]);

		releasePrimary();
		await hydration;
	});

	it("propagates a replica-lane gate shed instead of re-admitting on primary", async () => {
		makeReplicaEligible();
		_setFullSubjectGateConfigForTesting({
			config: {
				max_wait_ms: 60_000,
				replica_lane: {
					per_customer_limit: 1,
					per_org_limit: 100,
					per_customer_pending_max: 1,
					per_org_pending_max: 100,
				},
			},
		});
		_setFullSubjectGateEwmaForTesting(1);

		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		executePreparedImpl = async () => {
			await held;
			return [];
		};

		const tasks = Array.from({ length: 5 }, () =>
			getFullSubject({
				ctx: makeCtx(),
				customerId: "cus_gate_shed",
				readFrom: "replica-ok",
			}).then(
				() => ({ status: "ok" as const, error: null as unknown }),
				(error: unknown) => ({ status: "shed" as const, error }),
			),
		);
		// Let the replica lane saturate (1 running + 1 queued), then drain it.
		await new Promise((resolve) => setTimeout(resolve, 50));
		release();
		const results = await Promise.all(tasks);

		const shed = results.filter((result) => result.status === "shed");
		expect(shed.length).toBeGreaterThan(0);
		for (const result of shed) {
			expect(result.error).toMatchObject({
				statusCode: 429,
				code: "rate_limit_exceeded",
			});
		}
		expect(results.some((result) => result.status === "ok")).toBe(true);
		// Shed requests must never get a second admission on the primary pool.
		expect(hydrationPools.every((pool) => pool === "replica")).toBe(true);
	});

	it("still retries once on primary for a real replica failure", async () => {
		makeReplicaEligible();

		executePreparedImpl = ({ db }) =>
			db === replicaDb
				? Promise.reject(new Error("connection refused"))
				: Promise.resolve([]);

		const result = await getFullSubject({
			ctx: makeCtx(),
			customerId: "cus_replica_error",
			readFrom: "replica-ok",
		});

		expect(result).toBeUndefined();
		expect(hydrationPools).toEqual(["replica", "primary"]);
	});
});
