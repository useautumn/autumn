import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	setSystemTime,
} from "bun:test";

const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];

// Single ordered recorder: info/warn interleaving matters for transition order.
const loggedFields: Record<string, unknown>[] = [];
const info = mock((...args: unknown[]) => {
	loggedFields.push(args[0] as Record<string, unknown>);
});
const warn = mock((...args: unknown[]) => {
	loggedFields.push(args[0] as Record<string, unknown>);
});
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: {
		info,
		warn,
		error: mock(() => {}),
		debug: mock(() => {}),
		child: () => ({}),
	},
}));

const { EXPECTED_REPLICA_COUNT, REPLICA_LAG_MAX_MS } = await import(
	"@/db/probes/replicaLagProbe.js"
);
const {
	getReplicaRoutingState,
	startReplicaRoutingProber,
	stopReplicaRoutingProber,
	REPLICA_ROUTING_STALENESS_MS,
	_resetReplicaRoutingStateForTesting,
	_runProbeTickForTesting,
} = await import("@/db/replicaRoutingState.js");

type Row = Record<string, unknown>;

const replicaRow = (overrides: Row = {}): Row => ({
	in_recovery: false,
	application_name: "walreceiver-1",
	state: "streaming",
	sync_state: "quorum",
	replay_lag_ms: 10,
	write_lag_ms: 5,
	...overrides,
});

const healthyRows = (): Row[] =>
	Array.from({ length: EXPECTED_REPLICA_COUNT }, (_, index) =>
		replicaRow({ application_name: `walreceiver-${index + 1}` }),
	);

const fakeDb = (rows: Row[]) =>
	// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
	({ execute: async () => rows }) as any;

const throwingDb = () =>
	({
		execute: async () => {
			throw new Error("connection refused");
		},
		// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
	}) as any;

const transitionCalls = () =>
	loggedFields.filter(
		(fields) => fields?.type === "replica_routing_transition",
	);

const originalReplicaUrl = process.env.DATABASE_REPLICA_URL;

beforeEach(() => {
	info.mockClear();
	warn.mockClear();
	loggedFields.length = 0;
	_resetReplicaRoutingStateForTesting();
});

afterEach(() => {
	setSystemTime();
	stopReplicaRoutingProber();
	if (originalReplicaUrl === undefined) {
		delete process.env.DATABASE_REPLICA_URL;
	} else {
		process.env.DATABASE_REPLICA_URL = originalReplicaUrl;
	}
});

describe("getReplicaRoutingState", () => {
	it("is ineligible before any probe has run, without logging a transition", () => {
		const state = getReplicaRoutingState();

		expect(state.eligible).toBe(false);
		expect(state.updatedAt).toBe(0);
		expect(transitionCalls()).toHaveLength(0);
	});

	it("becomes eligible after a healthy probe of all expected replicas", async () => {
		await _runProbeTickForTesting({ db: fakeDb(healthyRows()) });

		const state = getReplicaRoutingState();
		expect(state.eligible).toBe(true);
		expect(state.replicaCount).toBe(EXPECTED_REPLICA_COUNT);
		expect(state.maxReplayLagMs).toBe(10);
		expect(state.updatedAt).toBeGreaterThan(0);
	});

	it("treats NULL lag columns as caught up (0ms), staying eligible", async () => {
		const rows = healthyRows().map((row) => ({
			...row,
			replay_lag_ms: null,
			write_lag_ms: null,
		}));
		await _runProbeTickForTesting({ db: fakeDb(rows) });

		const state = getReplicaRoutingState();
		expect(state.eligible).toBe(true);
		expect(state.maxReplayLagMs).toBe(0);
	});

	it("goes ineligible with count_mismatch when a replica vanishes", async () => {
		await _runProbeTickForTesting({ db: fakeDb(healthyRows()) });
		await _runProbeTickForTesting({ db: fakeDb([replicaRow()]) });

		const state = getReplicaRoutingState();
		expect(state.eligible).toBe(false);
		expect(state.replicaCount).toBe(1);

		const transitions = transitionCalls();
		expect(last(transitions)).toMatchObject({
			to: "ineligible",
			reason: "count_mismatch",
		});
	});

	it("goes ineligible with lag_exceeded when replay lag breaches the bound", async () => {
		await _runProbeTickForTesting({ db: fakeDb(healthyRows()) });

		const [first, ...rest] = healthyRows();
		const laggedRows = [{ ...first, replay_lag_ms: 61_000 }, ...rest];
		await _runProbeTickForTesting({ db: fakeDb(laggedRows) });

		const state = getReplicaRoutingState();
		expect(state.eligible).toBe(false);
		expect(state.maxReplayLagMs).toBe(61_000);
		expect(last(transitionCalls())).toMatchObject({
			to: "ineligible",
			reason: "lag_exceeded",
		});
	});

	it("requires lag strictly below REPLICA_LAG_MAX_MS", async () => {
		const atBound = healthyRows().map((row) => ({
			...row,
			replay_lag_ms: REPLICA_LAG_MAX_MS,
		}));
		await _runProbeTickForTesting({ db: fakeDb(atBound) });
		expect(getReplicaRoutingState().eligible).toBe(false);

		const belowBound = healthyRows().map((row) => ({
			...row,
			replay_lag_ms: REPLICA_LAG_MAX_MS - 1,
		}));
		await _runProbeTickForTesting({ db: fakeDb(belowBound) });
		expect(getReplicaRoutingState().eligible).toBe(true);
	});

	it("fails toward primary with probe_error when the probe throws", async () => {
		await _runProbeTickForTesting({ db: fakeDb(healthyRows()) });
		await _runProbeTickForTesting({ db: throwingDb() });

		expect(getReplicaRoutingState().eligible).toBe(false);
		expect(last(transitionCalls())).toMatchObject({
			to: "ineligible",
			reason: "probe_error",
		});
	});

	it("treats a blind probe (not reading a primary) as a probe error", async () => {
		await _runProbeTickForTesting({ db: fakeDb(healthyRows()) });
		await _runProbeTickForTesting({
			db: fakeDb(healthyRows().map((row) => ({ ...row, in_recovery: true }))),
		});

		expect(getReplicaRoutingState().eligible).toBe(false);
		expect(last(transitionCalls())).toMatchObject({
			to: "ineligible",
			reason: "probe_error",
		});
	});

	it("goes ineligible with stale_probe once the snapshot ages past the bound", async () => {
		await _runProbeTickForTesting({ db: fakeDb(healthyRows()) });
		expect(getReplicaRoutingState().eligible).toBe(true);

		setSystemTime(new Date(Date.now() + REPLICA_ROUTING_STALENESS_MS + 1_000));

		expect(getReplicaRoutingState().eligible).toBe(false);
		expect(last(transitionCalls())).toMatchObject({
			to: "ineligible",
			reason: "stale_probe",
		});
	});
});

describe("transition logging", () => {
	it("logs once per flip, never per tick or per read", async () => {
		const healthy = fakeDb(healthyRows());
		const degraded = fakeDb([replicaRow()]);

		await _runProbeTickForTesting({ db: healthy });
		await _runProbeTickForTesting({ db: healthy });
		await _runProbeTickForTesting({ db: healthy });
		expect(transitionCalls()).toHaveLength(1);
		expect(transitionCalls()[0]).toMatchObject({
			to: "eligible",
			reason: "recovered",
		});

		await _runProbeTickForTesting({ db: degraded });
		await _runProbeTickForTesting({ db: degraded });
		await _runProbeTickForTesting({ db: degraded });
		expect(transitionCalls()).toHaveLength(2);

		for (let i = 0; i < 5; i++) {
			getReplicaRoutingState();
		}
		expect(transitionCalls()).toHaveLength(2);

		await _runProbeTickForTesting({ db: healthy });
		expect(transitionCalls()).toHaveLength(3);
		expect(last(transitionCalls())).toMatchObject({
			to: "eligible",
			reason: "recovered",
		});
	});
});

describe("startReplicaRoutingProber", () => {
	it("skips entirely (with one info log) when DATABASE_REPLICA_URL is unset", () => {
		delete process.env.DATABASE_REPLICA_URL;

		startReplicaRoutingProber({ db: fakeDb(healthyRows()) });

		const skipped = info.mock.calls
			.map((call) => call[0] as Record<string, unknown>)
			.filter((fields) => fields?.type === "replica_routing_prober_skipped");
		expect(skipped).toHaveLength(1);
		expect(getReplicaRoutingState().updatedAt).toBe(0);
	});

	it("probes immediately on start and is idempotent", async () => {
		process.env.DATABASE_REPLICA_URL = "postgres://replica.invalid/autumn";

		startReplicaRoutingProber({ db: fakeDb(healthyRows()) });
		startReplicaRoutingProber({ db: fakeDb(healthyRows()) });
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(getReplicaRoutingState().eligible).toBe(true);
		const started = info.mock.calls
			.map((call) => call[0] as Record<string, unknown>)
			.filter((fields) => fields?.type === "replica_routing_prober_start");
		expect(started).toHaveLength(1);
	});
});
