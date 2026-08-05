import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	_resetReplicaRoutingStateForTesting,
	_setReplicaRoutingProbeForTesting,
} from "@/db/replicaRoutingState.js";
import {
	_setLedgerDbOverrideForTesting,
	_setReplicaDbOverrideForTesting,
	resolveSubjectReadDb,
} from "@/db/resolveSubjectReadDb.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { _resetRecentlyUpdatedNegativeCacheForTesting } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { _setFullSubjectGateConfigForTesting } from "@/internal/misc/edgeConfigs/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

const primaryDb = { pool: "primary" } as unknown as DrizzleCli;
const replicaDb = { pool: "replica" } as unknown as DrizzleCli;
const quietLedgerDb = {
	execute: () => Promise.resolve([]),
} as unknown as DrizzleCli;
const freshLedgerDb = {
	execute: () => Promise.resolve([{ fresh: true }]),
} as unknown as DrizzleCli;

const makeCtx = ({ skipCache }: { skipCache: boolean }): AutumnContext =>
	({ db: primaryDb, skipCache }) as unknown as AutumnContext;

const baseArgs = {
	readFrom: "replica-ok" as const,
	orgId: "org-share-test",
	env: "live",
	customerId: "cus-share-test",
};

const setShare = (replica_share: number) =>
	_setFullSubjectGateConfigForTesting({
		config: { read_split: { replica_share } },
	});

const makeReplicaEligible = () => {
	_setReplicaRoutingProbeForTesting({ replicaCount: 2, maxReplayLagMs: 0 });
	_setReplicaDbOverrideForTesting(replicaDb);
	_setLedgerDbOverrideForTesting(quietLedgerDb);
};

afterEach(() => {
	_setReplicaDbOverrideForTesting(null);
	_setLedgerDbOverrideForTesting(null);
	_resetReplicaRoutingStateForTesting();
	_resetRecentlyUpdatedNegativeCacheForTesting();
	_setFullSubjectGateConfigForTesting({ config: {} });
});

afterAll(() => {
	_setFullSubjectGateConfigForTesting({ config: {} });
});

describe("resolveSubjectReadDb steady-state share", () => {
	test("share=0 (the default) pins steady-state misses to the primary", async () => {
		makeReplicaEligible();
		setShare(0);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: false }),
			...baseArgs,
		});
		expect(resolved.source).toBe("primary");
		expect(resolved.db).toBe(primaryDb);
	});

	test("share=1 routes a steady-state miss to the replica", async () => {
		makeReplicaEligible();
		setShare(1);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: false }),
			...baseArgs,
		});
		expect(resolved.source).toBe("replica");
		expect(resolved.db).toBe(replicaDb);
	});

	test("skipCache (outage path) stays replica-eligible regardless of share", async () => {
		makeReplicaEligible();
		setShare(0);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: true }),
			...baseArgs,
		});
		expect(resolved.source).toBe("replica");
		expect(resolved.db).toBe(replicaDb);
	});

	test("readFrom primary always pins primary, even at share=1 with skipCache", async () => {
		makeReplicaEligible();
		setShare(1);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: true }),
			...baseArgs,
			readFrom: "primary",
		});
		expect(resolved.source).toBe("primary");
		expect(resolved.db).toBe(primaryDb);
	});

	test("share=1 still respects the prober veto", async () => {
		makeReplicaEligible();
		// Never-probed state reads as stale -> ineligible.
		_resetReplicaRoutingStateForTesting();
		setShare(1);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: false }),
			...baseArgs,
		});
		expect(resolved.source).toBe("primary");
		expect(resolved.db).toBe(primaryDb);
	});

	test("share=1 still respects the recently-updated ledger veto", async () => {
		makeReplicaEligible();
		_setLedgerDbOverrideForTesting(freshLedgerDb);
		setShare(1);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: false }),
			...baseArgs,
		});
		expect(resolved.source).toBe("primary");
		expect(resolved.db).toBe(primaryDb);
	});

	test("share=1 still fails safe to primary when the ledger check throws", async () => {
		makeReplicaEligible();
		_setLedgerDbOverrideForTesting({
			execute: () => Promise.reject(new Error("ledger unavailable")),
		} as unknown as DrizzleCli);
		setShare(1);

		const resolved = await resolveSubjectReadDb({
			ctx: makeCtx({ skipCache: false }),
			...baseArgs,
		});
		expect(resolved.source).toBe("primary");
		expect(resolved.db).toBe(primaryDb);
	});
});
