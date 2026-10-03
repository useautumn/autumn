import { describe, expect, test } from "bun:test";
import {
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectRowsEnvelope, SubjectSnapshotRow } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createEntityLoads } from "../../../../../src/processor/subject/entityLoads/createEntityLoads.js";
import { createInFlightLoads } from "../../../../../src/processor/subject/inFlightLoads/createInFlightLoads.js";
import { createSnapshotLoader } from "../../../../../src/processor/subject/snapshotLoader/createSnapshotLoader.js";
import { loadSubjectBaseline } from "../../../../../src/processor/subject/snapshotLoader/loadSubjectBaseline.js";
import {
	SNAPSHOT_BATCH_SIZE,
	SNAPSHOT_FALLBACKS_IN_FLIGHT,
	SNAPSHOT_QUARANTINE_AFTER,
	SNAPSHOT_QUARANTINE_MS,
	SNAPSHOT_QUEUE_CAP,
} from "../../../../../src/processor/subject/snapshotLoader/snapshotLoaderLimits.js";
import {
	SubjectLoadBusyError,
	SubjectNotFoundError,
} from "../../../../../src/processor/subject/subjectErrors.js";
import { createSubjectJoinCache } from "../../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectScope } from "../../../../../src/processor/subject/types/subject.js";
import { createTestCatalogCache } from "../../../../fixtures/catalog.js";
import { createState } from "../../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../../fixtures/subjectSnapshotsStore.js";

const NOW = 1_700_000_000_000;
const identityOf = (customerId: string): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
});
const keyOf = (customerId: string) =>
	meteringIdentityToSubjectKey({ identity: identityOf(customerId) });

const envelopeOf = (customerId: string): SubjectRowsEnvelope => ({
	customer: {
		internal_id: `${customerId}_internal`,
		id: customerId,
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
});

const rowOf = (
	customerId: string,
	overrides: Partial<SubjectSnapshotRow> = {},
): SubjectSnapshotRow => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
	state: createState({ identity: identityOf(customerId), balance: 42 }),
	baselineAt: NOW - 1_000,
	...overrides,
});

const pgError = (code: string, message = code) =>
	Object.assign(new Error(message), { errno: code });

/** A hydrator scope over a scripted Postgres: snapshot rows by customer, full reads by customer, both recorded. */
const createScope = ({
	rows = [],
	full = {},
	mode = "serve",
	fullDelayMs = 0,
}: {
	rows?: SubjectSnapshotRow[];
	/** A full read's answer per customer: an envelope, null (not found), or an error to throw. */
	full?: Record<string, SubjectRowsEnvelope | null | Error>;
	mode?: "off" | "write" | "serve";
	fullDelayMs?: number;
} = {}) => {
	const selects: MeteringIdentity[][] = [];
	const fullReads: string[] = [];
	const logged: unknown[] = [];
	let fullInFlight = 0;
	let fullInFlightMax = 0;
	let selectFailures: Error[] = [];
	let timeoutFor:
		| ((identities: readonly MeteringIdentity[]) => boolean)
		| null = null;
	let now = NOW;
	const catalogCache = createTestCatalogCache();
	const sleeps: number[] = [];
	const scope: SubjectScope = {
		ctx: {
			catalogCache,
			db: {
				readSubjectSnapshots: async ({ identities }) => {
					selects.push([...identities]);
					const failure = selectFailures.shift();
					if (failure) throw failure;
					if (timeoutFor?.(identities))
						throw pgError("57014", "statement timeout");
					const wanted = new Set(
						identities.map((identity) => identity.customerId),
					);
					return rows.filter((row) => wanted.has(row.customerId));
				},
				getSubjectRows: async ({ identity }) => {
					fullReads.push(identity.customerId);
					fullInFlight += 1;
					fullInFlightMax = Math.max(fullInFlightMax, fullInFlight);
					try {
						if (fullDelayMs > 0) await Bun.sleep(fullDelayMs);
						const answer = full[identity.customerId];
						if (answer instanceof Error) throw answer;
						if (answer === null) return null;
						return answer ?? envelopeOf(identity.customerId);
					} finally {
						fullInFlight -= 1;
					}
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
			receiptPolicy: { retentionMs: 60_000, now: () => now },
			subjectSnapshotsConfig: createSubjectSnapshotsStore({ mode }),
			partition: 7,
			logger: {
				info: (...args: unknown[]) => logged.push(args),
				warn: (...args: unknown[]) => logged.push(args),
			},
		},
		state: {
			inFlightLoads: createInFlightLoads(),
			joinCache: createSubjectJoinCache({
				ctx: { catalogCache, config: { catalogRecheckMs: 300_000 } },
			}),
			entityLoads: createEntityLoads({ scopeOf: () => scope }),
			snapshotLoader: createSnapshotLoader({
				scopeOf: () => scope,
				sleep: async (ms) => {
					sleeps.push(ms);
				},
			}),
		},
	};
	const load = (customerId: string, asOf = now) =>
		loadSubjectBaseline({
			scope,
			identity: identityOf(customerId),
			occurredAt: asOf,
		});
	const batchLines = () =>
		logged.filter(
			(args) =>
				(args as [{ event?: string }])[0]?.event ===
				"balance_worker.snapshot_batch",
		) as [{ data: Record<string, unknown> }][];
	return {
		scope,
		load,
		selects,
		fullReads,
		sleeps,
		batchLines,
		logged,
		fullInFlightMax: () => fullInFlightMax,
		failNextSelects: (errors: Error[]) => {
			selectFailures = errors;
		},
		timeoutWhen: (
			predicate: (identities: readonly MeteringIdentity[]) => boolean,
		) => {
			timeoutFor = predicate;
		},
		advance: (ms: number) => {
			now += ms;
		},
	};
};

const balanceOf = (state: SubjectState) =>
	state.customerEntitlements[0]?.balance;

describe("the snapshot loader", () => {
	test("with the store off, a cold load is the full query and no SELECT is ever asked", async () => {
		const { load, selects, fullReads } = createScope({
			mode: "write",
			rows: [rowOf("cus_1")],
		});
		const state = await load("cus_1");
		expect(state.customer.id).toBe("cus_1");
		expect(selects).toEqual([]);
		expect(fullReads).toEqual(["cus_1"]);
	});

	test("loads arriving in one turn share one SELECT; hits answer from their rows, misses from the full query, one line for the batch", async () => {
		const { load, selects, fullReads, batchLines } = createScope({
			rows: [rowOf("cus_1"), rowOf("cus_2")],
		});
		const [a, b, c] = await Promise.all([
			load("cus_1"),
			load("cus_2"),
			load("cus_3"),
		]);
		expect(balanceOf(a)).toBe(42);
		expect(balanceOf(b)).toBe(42);
		expect(c.customer.id).toBe("cus_3");
		expect(selects).toHaveLength(1);
		expect(selects[0]?.map((identity) => identity.customerId)).toEqual([
			"cus_1",
			"cus_2",
			"cus_3",
		]);
		expect(fullReads).toEqual(["cus_3"]);
		await Bun.sleep(1);
		expect(batchLines()).toHaveLength(1);
		expect(batchLines()[0]?.[0].data).toMatchObject({
			partition: 7,
			size: 3,
			hits: 2,
			absent: 1,
			queueDepth: 0,
		});
	});

	test("a load arriving while a SELECT is out joins the next SELECT, never a SELECT of its own", async () => {
		const { load, selects } = createScope({ rows: [], fullDelayMs: 5 });
		const first = load("cus_1");
		await Bun.sleep(1);
		const second = load("cus_2");
		const third = load("cus_3");
		await Promise.all([first, second, third]);
		expect(
			selects.map((batch) => batch.map((identity) => identity.customerId)),
		).toEqual([["cus_1"], ["cus_2", "cus_3"]]);
	});

	test("a poison row misses for its subject only: the others resolve from the same batch", async () => {
		const { load, selects, fullReads, batchLines } = createScope({
			rows: [
				rowOf("cus_1"),
				rowOf("cus_2", { state: { nope: true } }),
				rowOf("cus_3"),
			],
		});
		await Promise.all([load("cus_1"), load("cus_2"), load("cus_3")]);
		expect(selects).toHaveLength(1);
		expect(fullReads).toEqual(["cus_2"]);
		await Bun.sleep(1);
		expect(batchLines()[0]?.[0].data).toMatchObject({ hits: 2, parse: 1 });
	});

	test("misses go to the full query a few at a time, never all at once", async () => {
		const { load, fullInFlightMax } = createScope({ fullDelayMs: 2 });
		await Promise.all(
			Array.from({ length: 12 }, (_, index) => load(`cus_${index}`)),
		);
		expect(fullInFlightMax()).toBe(SNAPSHOT_FALLBACKS_IN_FLIGHT);
	});

	test("a subject whose full query keeps failing is quarantined: the next load is NOT_READY with no statement, a sibling is unaffected, one warn; after the window one probe goes through and success clears it", async () => {
		const { load, fullReads, selects, logged, advance } = createScope({
			full: { cus_bad: pgError("57014", "statement timeout") },
		});
		for (let attempt = 0; attempt < SNAPSHOT_QUARANTINE_AFTER; attempt++)
			await expect(load("cus_bad")).rejects.toThrow("statement timeout");
		const warns = logged.filter(
			(args) =>
				(args as [{ event?: string }])[0]?.event ===
				"balance_worker.snapshot_quarantined",
		);
		expect(warns).toHaveLength(1);

		const selectsBefore = selects.length;
		const readsBefore = fullReads.length;
		await expect(load("cus_bad")).rejects.toBeInstanceOf(SubjectLoadBusyError);
		expect(fullReads).toHaveLength(readsBefore);
		expect(selects).toHaveLength(selectsBefore + 1);
		expect((await load("cus_fine")).customer.id).toBe("cus_fine");

		advance(SNAPSHOT_QUARANTINE_MS);
		await expect(load("cus_bad")).rejects.toThrow("statement timeout");
		expect(fullReads).toHaveLength(readsBefore + 2);
		await expect(load("cus_bad")).rejects.toBeInstanceOf(SubjectLoadBusyError);
	});

	test("a customer that does not exist is an answer, not a failure: never quarantined", async () => {
		const { load } = createScope({ full: { cus_gone: null } });
		for (let attempt = 0; attempt < SNAPSHOT_QUARANTINE_AFTER + 1; attempt++)
			await expect(load("cus_gone")).rejects.toBeInstanceOf(
				SubjectNotFoundError,
			);
	});

	test("a SELECT Postgres refuses transiently answers nobody: the batch waits out a backoff and is asked again whole, no subject counted", async () => {
		const { load, selects, sleeps, fullReads, failNextSelects } = createScope({
			rows: [rowOf("cus_1")],
		});
		failNextSelects([
			pgError("08006", "connection reset"),
			pgError("08006", "connection reset"),
		]);
		const loads = Promise.all(
			Array.from({ length: 50 }, (_, index) => load(`cus_${index}`)),
		);
		await loads;
		expect(selects).toHaveLength(3);
		expect(selects.every((batch) => batch.length === 50)).toBe(true);
		expect(sleeps).toEqual([50, 100]);
		expect(fullReads).toHaveLength(49);
	});

	test("a SELECT that hits the statement timeout is halved until the halves answer; the lone slow subject goes to its full query", async () => {
		const { load, selects, fullReads, timeoutWhen } = createScope({
			rows: Array.from({ length: 8 }, (_, index) => rowOf(`cus_${index}`)),
		});
		timeoutWhen((identities) =>
			identities.some((identity) => identity.customerId === "cus_5"),
		);
		const states = await Promise.all(
			Array.from({ length: 8 }, (_, index) => load(`cus_${index}`)),
		);
		expect(states.filter((state) => balanceOf(state) === 42)).toHaveLength(7);
		expect(fullReads).toEqual(["cus_5"]);
		// 8 → 4+4 → 2+2 → 1+1: the whole, then three halvings down the slow side.
		expect(selects.length).toBeLessThanOrEqual(1 + 2 * 3);
	});

	test("a batch refused for a reason that will not pass sends everyone in it to the full query", async () => {
		const { load, fullReads, failNextSelects, batchLines } = createScope({
			rows: [rowOf("cus_1")],
		});
		failNextSelects([
			pgError("42P01", 'relation "subject_snapshots" does not exist'),
		]);
		await Promise.all([load("cus_1"), load("cus_2")]);
		expect(fullReads.sort()).toEqual(["cus_1", "cus_2"]);
		await Bun.sleep(1);
		expect(batchLines()[0]?.[0].data).toMatchObject({
			refused: expect.stringContaining("does not exist"),
		});
	});

	test("past the queue cap a load is refused at once, NOT_READY, with no statement", async () => {
		const { load, selects } = createScope({ fullDelayMs: 1 });
		const loads = Array.from({ length: SNAPSHOT_QUEUE_CAP }, (_, index) =>
			load(`cus_${index}`),
		);
		await expect(load("cus_overflow")).rejects.toBeInstanceOf(
			SubjectLoadBusyError,
		);
		expect(selects).toHaveLength(0);
		await Promise.all(loads);
		expect(selects).toHaveLength(
			Math.ceil(SNAPSHOT_QUEUE_CAP / SNAPSHOT_BATCH_SIZE),
		);
	}, 20_000);

	test("a load for a time other than now is a replay: the rows alone, never queued for a row written for now", async () => {
		const { load, selects, fullReads, batchLines } = createScope({
			rows: [rowOf("cus_1")],
		});
		const state = await load("cus_1", NOW - 5_000);
		expect(state.customer.id).toBe("cus_1");
		expect(fullReads).toEqual(["cus_1"]);
		expect(selects).toEqual([]);
		expect(batchLines()).toEqual([]);
		expect(
			(await load("cus_1", NOW + 1_000)).customerEntitlements[0]?.balance,
		).toBe(42);
	});

	test("a row's age is not a reason: a row written long ago is served until an evict deletes it", async () => {
		const { load, fullReads } = createScope({
			rows: [rowOf("cus_old", { baselineAt: NOW - 30 * 86_400_000 })],
		});
		expect((await load("cus_old")).customerEntitlements[0]?.balance).toBe(42);
		expect(fullReads).toEqual([]);
	});

	test("the same subject asked twice while queued is one entry: both callers get one answer", async () => {
		const { load, selects, fullReads } = createScope({
			rows: [rowOf("cus_1")],
		});
		const [a, b] = await Promise.all([load("cus_1"), load("cus_1")]);
		expect(a).toBe(b);
		expect(selects).toHaveLength(1);
		expect(selects[0]).toHaveLength(1);
		expect(fullReads).toEqual([]);
		expect(keyOf("cus_1")).toBe(
			meteringIdentityToSubjectKey({ identity: a.identity }),
		);
	});
});
