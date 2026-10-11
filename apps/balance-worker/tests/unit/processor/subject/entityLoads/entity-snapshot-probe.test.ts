import { describe, expect, test } from "bun:test";
import type { MeteringIdentity } from "@autumn/balance-engine";
import type { SubjectSnapshotMode } from "@autumn/edge-config";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createEntityLoads } from "../../../../../src/processor/subject/entityLoads/createEntityLoads.js";
import { createInFlightLoads } from "../../../../../src/processor/subject/inFlightLoads/createInFlightLoads.js";
import { createSnapshotRefresh } from "../../../../../src/processor/subject/snapshotRefresh/createSnapshotRefresh.js";
import { createSubjectJoinCache } from "../../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectScope } from "../../../../../src/processor/subject/types/subject.js";
import { createTestCatalogCache } from "../../../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	createState,
} from "../../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../../fixtures/subjectSnapshotsStore.js";

const NOW = 1_700_000_000_000;
const customer: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const entityOf = (entityId: string): MeteringIdentity => ({
	...customer,
	entityId,
});

const envelopeOf = (entityId: string): SubjectRowsEnvelope => ({
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
	entity: {
		id: entityId,
		internal_id: `${entityId}_internal`,
		internal_customer_id: "cus_1_internal",
		feature_id: "seats",
		internal_feature_id: "feat_seats",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		created_at: NOW,
		name: null,
		deleted: false,
	},
});

/** Entity loads over a scripted Postgres: `rows` are the snapshot rows that exist, every full read answers the entity's own rows. */
const createScope = ({
	mode = "serve",
	rows = new Map<string, unknown>(),
}: {
	mode?: SubjectSnapshotMode;
	rows?: Map<string, unknown>;
} = {}) => {
	const probes: string[][] = [];
	const fullReads: string[][] = [];
	const warnings: unknown[] = [];
	const catalogCache = createTestCatalogCache();
	const scope: SubjectScope = {
		ctx: {
			catalogCache,
			db: {
				readSubjectSnapshot: async () => null,
				readEntitySubjectSnapshots: async ({ entityIds }) => {
					probes.push([...entityIds]);
					return new Map(
						entityIds.flatMap((id) =>
							rows.has(id) ? [[id, rows.get(id)]] : [],
						),
					);
				},
				getSubjectRows: async () => null,
				getEntitySubjectRows: async ({ entityIds }) => {
					fullReads.push([...entityIds]);
					return entityIds.map(envelopeOf);
				},
			},
			writer: {
				waitForEvicted: () => null,
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
	const load = (entityIds: string[], rowsOnly = false) =>
		Promise.all(
			entityIds.map((entityId) =>
				scope.state.entityLoads.load({
					identity: entityOf(entityId),
					rowsOnly,
				}),
			),
		);
	return { load, probes, fullReads, warnings };
};

const rowFor = (entityId: string, balance: number) => ({
	...createState({ identity: entityOf(entityId), balance }),
	revision: 7,
});
const eventsOf = (warnings: unknown[]) =>
	warnings.map((args) => (args as [{ event: string }])[0].event);

describe("entity loads probe snapshot rows", () => {
	test("serving: one probe for the batch, the rows for the misses alone; a hit settles from its row at revision zero", async () => {
		const { load, probes, fullReads } = createScope({
			rows: new Map([
				["en_1", rowFor("en_1", 95)],
				["en_3", rowFor("en_3", 90)],
			]),
		});
		const [first, second, third] = await load(["en_1", "en_2", "en_3"]);
		expect(probes).toEqual([["en_1", "en_2", "en_3"]]);
		expect(fullReads).toEqual([["en_2"]]);
		expect(first?.read.baseline.revision).toBe(0);
		expect(first?.read.baseline.customerEntitlements[0]?.balance).toBe(95);
		expect(second?.read.baseline.entity?.id).toBe("en_2");
		expect(third?.read.baseline.customerEntitlements[0]?.balance).toBe(90);
	});

	test("every entity a hit: the probe is the only statement", async () => {
		const { load, probes, fullReads } = createScope({
			rows: new Map([
				["en_1", rowFor("en_1", 1)],
				["en_2", rowFor("en_2", 2)],
			]),
		});
		await load(["en_1", "en_2"]);
		expect(probes).toHaveLength(1);
		expect(fullReads).toEqual([]);
	});

	test.each(["off", "write"] as const)(
		"mode %s: no probe, the rows alone",
		async (mode) => {
			const { load, probes, fullReads } = createScope({
				mode,
				rows: new Map([["en_1", rowFor("en_1", 1)]]),
			});
			await load(["en_1", "en_2"]);
			expect(probes).toEqual([]);
			expect(fullReads).toEqual([["en_1", "en_2"]]);
		},
	);

	test("rows-only entities skip the probe and are read whole, beside the batch's served ones", async () => {
		const { load, probes, fullReads } = createScope({
			rows: new Map([
				["en_1", rowFor("en_1", 1)],
				["en_2", rowFor("en_2", 2)],
			]),
		});
		const [served, reread] = await Promise.all([
			load(["en_1"]),
			load(["en_2"], true),
		]);
		expect(probes).toEqual([["en_1"]]);
		expect(fullReads).toEqual([["en_2"]]);
		expect(served[0]?.read.baseline.revision).toBe(0);
		expect(reread[0]?.read.baseline.entity?.id).toBe("en_2");
	});

	test("verifying: the probe and the rows for everyone; the rows are served and a row that disagrees is logged by field", async () => {
		const { load, probes, fullReads, warnings } = createScope({
			mode: "verify",
			rows: new Map([
				[
					"en_1",
					{
						...rowFor("en_1", 95),
						customerEntitlements: [createCustomerEntitlement({ balance: 95 })],
					},
				],
			]),
		});
		const [first] = await load(["en_1", "en_2"]);
		expect(probes).toEqual([["en_1", "en_2"]]);
		expect(fullReads).toEqual([["en_1", "en_2"]]);
		expect(first?.read.baseline.entity?.id).toBe("en_1");
		expect(eventsOf(warnings)).toEqual(["balance_worker.snapshot_mismatch"]);
	});

	test("a row that will not parse is warned about and its entity is read whole like a miss", async () => {
		const { load, fullReads, warnings } = createScope({
			rows: new Map([["en_1", { schemaVersion: 1, nope: true }]]),
		});
		const [first] = await load(["en_1"]);
		expect(fullReads).toEqual([["en_1"]]);
		expect(first?.read.baseline.entity?.id).toBe("en_1");
		expect(eventsOf(warnings)).toEqual(["balance_worker.snapshot_unreadable"]);
	});
});
