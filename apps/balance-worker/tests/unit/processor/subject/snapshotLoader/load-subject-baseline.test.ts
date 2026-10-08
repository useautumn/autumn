import { describe, expect, test } from "bun:test";
import type { MeteringIdentity } from "@autumn/balance-engine";
import type { SubjectSnapshotMode } from "@autumn/edge-config";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { subjectEnvelopeToState } from "../../../../../src/processor/subject/actions/ensureSubject/readSubjectBaseline.js";
import { createEntityLoads } from "../../../../../src/processor/subject/entityLoads/createEntityLoads.js";
import { createInFlightLoads } from "../../../../../src/processor/subject/inFlightLoads/createInFlightLoads.js";
import { loadSubjectBaseline } from "../../../../../src/processor/subject/snapshotLoader/loadSubjectBaseline.js";
import { createSnapshotRefresh } from "../../../../../src/processor/subject/snapshotRefresh/createSnapshotRefresh.js";
import { SubjectNotFoundError } from "../../../../../src/processor/subject/subjectErrors.js";
import { createSubjectJoinCache } from "../../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectScope } from "../../../../../src/processor/subject/types/subject.js";
import { createTestCatalogCache } from "../../../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	createState,
} from "../../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../../fixtures/subjectSnapshotsStore.js";

const NOW = 1_700_000_000_000;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const envelope: SubjectRowsEnvelope = {
	customer: {
		internal_id: "cus_1_internal",
		id: "cus_1",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		created_at: NOW,
		processor: null,
		metadata: null,
		send_email_receipts: false,
		config: null,
		spend_limits: null,
		overage_allowed: null,
		usage_limits: null,
		usage_alerts: null,
	},
	customer_products: [],
	customer_prices: [],
	customer_entitlements: [],
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity: null,
};

/** A hydrator scope over a scripted Postgres that records each probe and each full read and answers what it is told. */
const createScope = ({
	mode = "serve",
	snapshot = null,
	rows = envelope,
}: {
	mode?: SubjectSnapshotMode;
	snapshot?: unknown;
	rows?: SubjectRowsEnvelope | null;
} = {}) => {
	const probes: string[] = [];
	const fullReads: string[] = [];
	const warnings: unknown[] = [];
	const catalogCache = createTestCatalogCache();
	const scope: SubjectScope = {
		ctx: {
			catalogCache,
			db: {
				readSubjectSnapshot: async ({ identity }) => {
					probes.push(identity.customerId);
					return snapshot;
				},
				getSubjectRows: async ({ identity }) => {
					fullReads.push(identity.customerId);
					return rows;
				},
				readEntitySubjectSnapshots: async () => new Map(),
				getEntitySubjectRows: async () => [],
			},
			writer: {
				decide: () => {
					throw new Error("not exercised");
				},
				readFreshestState: () => null,
				adopt: ({ state }) => state,
			},
			receiptPolicy: { retentionMs: 60_000, now: () => NOW },
			subjectSnapshotsConfig: createSubjectSnapshotsStore({ mode }),
			logger: { warn: (...args: unknown[]) => warnings.push(args) },
		},
		state: {
			inFlightLoads: createInFlightLoads(),
			joinCache: createSubjectJoinCache({
				ctx: { catalogCache, config: { catalogRecheckMs: 300_000 } },
			}),
			entityLoads: createEntityLoads({ scopeOf: () => scope }),
			snapshotRefresh: createSnapshotRefresh({ ctx: {}, scopeOf: () => scope }),
		},
	};
	const load = (occurredAt = NOW) =>
		loadSubjectBaseline({ scope, identity, occurredAt });
	return { load, probes, fullReads, warnings };
};

const eventsOf = (warnings: unknown[]) =>
	warnings.map((args) => (args as [{ event: string }])[0].event);

describe("loadSubjectBaseline", () => {
	test("serving: one probe for this build's row, and a row that parses is the baseline at revision zero with no full read", async () => {
		const { load, probes, fullReads } = createScope({
			snapshot: { ...createState({ identity, balance: 95 }), revision: 9 },
		});
		const state = await load();
		expect(probes).toEqual(["cus_1"]);
		expect(fullReads).toEqual([]);
		expect(state.revision).toBe(0);
		expect(state.customerEntitlements[0]?.balance).toBe(95);
	});

	test("serving with no row: the probe misses and the rows are read whole", async () => {
		const { load, probes, fullReads, warnings } = createScope();
		const state = await load();
		expect(probes).toEqual(["cus_1"]);
		expect(fullReads).toEqual(["cus_1"]);
		expect(state.customer.id).toBe("cus_1");
		expect(warnings).toEqual([]);
	});

	test.each(["off", "write"] as const)(
		"mode %s: no probe, the rows alone",
		async (mode) => {
			const { load, probes, fullReads } = createScope({
				mode,
				snapshot: createState({ identity }),
			});
			const state = await load();
			expect(probes).toEqual([]);
			expect(fullReads).toEqual(["cus_1"]);
			expect(state.customer.id).toBe("cus_1");
		},
	);

	test("a read for another time than now is a replay: no probe, never a row written for now", async () => {
		const { load, probes } = createScope({
			snapshot: createState({ identity }),
		});
		await load(NOW - 5_000);
		expect(probes).toEqual([]);
		expect((await load(NOW + 1_000)).revision).toBe(0);
		expect(probes).toEqual(["cus_1"]);
	});

	test("a row that will not parse is warned about and the rows are read whole", async () => {
		const { load, fullReads, warnings } = createScope({
			snapshot: { schemaVersion: 1, nope: true },
		});
		const state = await load();
		expect(state.customer.id).toBe("cus_1");
		expect(fullReads).toEqual(["cus_1"]);
		expect(warnings).toHaveLength(1);
		expect((warnings[0] as [{ event: string }])[0].event).toBe(
			"balance_worker.snapshot_unreadable",
		);
	});

	test("no row and no rows is a customer that does not exist", async () => {
		const { load } = createScope({ rows: null });
		await expect(load()).rejects.toBeInstanceOf(SubjectNotFoundError);
	});
	describe("verifying", () => {
		const rowsState = subjectEnvelopeToState({ identity, envelope });

		test("the row is probed and the rows are read anyway; the rows are served, a row that agrees logs nothing", async () => {
			const { load, probes, fullReads, warnings } = createScope({
				mode: "verify",
				snapshot: { ...rowsState, revision: 4 },
			});
			expect(await load()).toEqual(rowsState);
			expect(probes).toEqual(["cus_1"]);
			expect(fullReads).toEqual(["cus_1"]);
			expect(warnings).toEqual([]);
		});

		test("a row that disagrees is logged with the fields where it does; the rows are still what is served", async () => {
			const { load, warnings } = createScope({
				mode: "verify",
				snapshot: {
					...rowsState,
					customerEntitlements: [createCustomerEntitlement({ balance: 95 })],
				},
			});
			expect(await load()).toEqual(rowsState);
			expect(warnings).toHaveLength(1);
			const [record] = warnings[0] as [{ event: string; data: unknown }];
			expect(record.event).toBe("balance_worker.snapshot_mismatch");
			expect(record.data).toEqual({
				identity,
				fields: ["customerEntitlements"],
			});
		});

		test("a row that will not parse is the unreadable warning; the rows were read anyway", async () => {
			const { load, fullReads, warnings } = createScope({
				mode: "verify",
				snapshot: { schemaVersion: 1, nope: true },
			});
			expect(await load()).toEqual(rowsState);
			expect(fullReads).toEqual(["cus_1"]);
			expect(eventsOf(warnings)).toEqual([
				"balance_worker.snapshot_unreadable",
			]);
		});
	});
});
