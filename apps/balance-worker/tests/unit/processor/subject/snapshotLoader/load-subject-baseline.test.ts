import { describe, expect, test } from "bun:test";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createEntityLoads } from "../../../../../src/processor/subject/entityLoads/createEntityLoads.js";
import { createInFlightLoads } from "../../../../../src/processor/subject/inFlightLoads/createInFlightLoads.js";
import { loadSubjectBaseline } from "../../../../../src/processor/subject/snapshotLoader/loadSubjectBaseline.js";
import { SubjectNotFoundError } from "../../../../../src/processor/subject/subjectErrors.js";
import { createSubjectJoinCache } from "../../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectScope } from "../../../../../src/processor/subject/types/subject.js";
import { createTestCatalogCache } from "../../../../fixtures/catalog.js";
import { createState } from "../../../../fixtures/mutations.js";
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

/** A hydrator scope over a scripted Postgres that records what each read asked for and answers what it is told. */
const createScope = ({
	mode = "serve",
	snapshot = null,
	rows = envelope,
}: {
	mode?: "off" | "write" | "serve";
	snapshot?: unknown;
	rows?: SubjectRowsEnvelope | null;
} = {}) => {
	const asked: (number | undefined)[] = [];
	const warnings: unknown[] = [];
	const catalogCache = createTestCatalogCache();
	const scope: SubjectScope = {
		ctx: {
			catalogCache,
			db: {
				getSubjectRows: async ({ snapshotVersion }) => {
					asked.push(snapshotVersion);
					return snapshotVersion !== undefined && snapshot !== null
						? { snapshot, envelope: null }
						: { snapshot: null, envelope: rows };
				},
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
		},
	};
	const load = (occurredAt = NOW) =>
		loadSubjectBaseline({ scope, identity, occurredAt });
	return { load, asked, warnings };
};

describe("loadSubjectBaseline", () => {
	test("serving: the statement is asked for this build's snapshot, and a row that parses is the baseline at revision zero", async () => {
		const { load, asked } = createScope({
			snapshot: { ...createState({ identity, balance: 95 }), revision: 9 },
		});
		const state = await load();
		expect(asked).toEqual([BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION]);
		expect(state.revision).toBe(0);
		expect(state.customerEntitlements[0]?.balance).toBe(95);
	});

	test("serving with no row: the same statement answered the rows, nothing more was asked", async () => {
		const { load, asked, warnings } = createScope();
		const state = await load();
		expect(asked).toEqual([BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION]);
		expect(state.customer.id).toBe("cus_1");
		expect(warnings).toEqual([]);
	});

	test.each(["off", "write"] as const)(
		"mode %s: the statement is asked for the rows alone",
		async (mode) => {
			const { load, asked } = createScope({
				mode,
				snapshot: createState({ identity }),
			});
			const state = await load();
			expect(asked).toEqual([undefined]);
			expect(state.customer.id).toBe("cus_1");
		},
	);

	test("a read for another time than now is a replay: the rows alone, never a row written for now", async () => {
		const { load, asked } = createScope({
			snapshot: createState({ identity }),
		});
		await load(NOW - 5_000);
		expect(asked).toEqual([undefined]);
		expect((await load(NOW + 1_000)).revision).toBe(0);
		expect(asked).toEqual([undefined, BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION]);
	});

	test("a row that will not parse is warned about and the rows are read whole by one more statement", async () => {
		const { load, asked, warnings } = createScope({
			snapshot: { schemaVersion: 1, nope: true },
			rows: envelope,
		});
		const state = await load();
		expect(state.customer.id).toBe("cus_1");
		expect(asked).toEqual([BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION, undefined]);
		expect(warnings).toHaveLength(1);
		expect((warnings[0] as [{ event: string }])[0].event).toBe(
			"balance_worker.snapshot_unreadable",
		);
	});

	test("no row and no rows is a customer that does not exist", async () => {
		const { load } = createScope({ rows: null });
		await expect(load()).rejects.toBeInstanceOf(SubjectNotFoundError);
	});
});
