import { describe, expect, test } from "bun:test";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { createSnapshotRefreshQueue } from "../../../../../src/processor/subject/snapshotRefresh/createSnapshotRefreshQueue.js";
import type { SnapshotRefreshRead } from "../../../../../src/processor/subject/snapshotRefresh/types/snapshotRefreshQueue.js";
import { createState } from "../../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../../fixtures/subjectSnapshotsStore.js";

/** Two at a time and a ceiling of twelve: small enough to watch every read start and the ceiling bite. */
const REFRESH_CONCURRENCY = 2;
const REFRESH_MAX_PENDING = 12;

const customer = (customerId: string): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
});
/** What L10c's hook hands in after listing the customer's rows: its own subject and each entity's. */
const evict = (
	queue: ReturnType<typeof createSnapshotRefreshQueue>,
	customerId: string,
	entityIds: readonly string[],
) =>
	queue.enqueue({
		customer: customer(customerId),
		subjects: [
			customer(customerId),
			...entityIds.map((entityId) => ({ ...customer(customerId), entityId })),
		],
	});
const subjectOf = (identity: MeteringIdentity) =>
	identity.entityId
		? `${identity.customerId}/${identity.entityId}`
		: identity.customerId;

/** Reads the queue asks for are held until the test releases them, one promise per subject, in the order asked. */
const createScriptedReads = () => {
	const started: string[] = [];
	const written: string[] = [];
	const warnings: unknown[] = [];
	const releases = new Map<
		string,
		(read: SnapshotRefreshRead | null) => void
	>();
	const rejects = new Map<string, (cause: unknown) => void>();
	const queue = createSnapshotRefreshQueue({
		ctx: {
			read: ({ identity }) =>
				new Promise((resolve, reject) => {
					started.push(subjectOf(identity));
					releases.set(subjectOf(identity), resolve);
					rejects.set(subjectOf(identity), reject);
				}),
			write: ({ identity }) => {
				written.push(subjectOf(identity));
			},
			subjectSnapshotsConfig: createSubjectSnapshotsStore({
				mode: "write",
				refreshConcurrency: REFRESH_CONCURRENCY,
				refreshMaxPending: REFRESH_MAX_PENDING,
			}),
			logger: { warn: (...args: unknown[]) => warnings.push(args) },
		},
	});
	const readOf = (subject: string): SnapshotRefreshRead => ({
		baseline: createState({
			identity: {
				...customer(subject.split("/")[0] as string),
				entityId: subject.split("/")[1] ?? null,
			},
		}),
		baselineAt: 1,
		logOffset: 0n,
		bytes: 1_024,
	});
	const release = async (
		subject: string,
		read: SnapshotRefreshRead | null = readOf(subject),
	) => {
		const resolve = releases.get(subject);
		if (!resolve) throw new Error(`no read in flight for ${subject}`);
		releases.delete(subject);
		resolve(read);
		await Bun.sleep(0);
	};
	const fail = async (subject: string) => {
		rejects.get(subject)?.(new Error("connection reset"));
		releases.delete(subject);
		await Bun.sleep(0);
	};
	return { queue, started, written, warnings, release, fail };
};

describe("snapshot refresh queue", () => {
	test("oversized refreshes are skipped without an error; the size boundary is inclusive", async () => {
		const written: string[] = [];
		const warnings: unknown[] = [];
		const queue = createSnapshotRefreshQueue({
			ctx: {
				read: async ({ identity }) => ({
					baseline: createState({ identity }),
					baselineAt: 1,
					logOffset: 0n,
					bytes: identity.customerId === "oversized" ? 1_025 : 1_024,
				}),
				write: ({ identity }) => {
					written.push(identity.customerId);
				},
				subjectSnapshotsConfig: createSubjectSnapshotsStore({
					mode: "write",
					maxBytes: 1_024,
				}),
				logger: { warn: (...args: unknown[]) => warnings.push(args) },
			},
		});
		evict(queue, "oversized", []);
		evict(queue, "at_limit", []);
		await queue.settled();
		expect(written).toEqual(["at_limit"]);
		expect(queue.counts()).toEqual({
			queued: 2,
			refreshed: 1,
			skipped: 1,
			failed: 0,
		});
		expect(warnings).toEqual([]);
	});

	test("an evict queues the customer then its entities, FIFO, refreshConcurrency reading at a time; each read is written back", async () => {
		const { queue, started, written, release } = createScriptedReads();
		evict(queue, "cus_1", ["en_1", "en_2", "en_3"]);

		expect(queue.depth()).toBe(4);
		expect(started).toEqual(["cus_1", "cus_1/en_1"]);
		expect(REFRESH_CONCURRENCY).toBe(2);

		await release("cus_1/en_1");
		expect(started).toEqual(["cus_1", "cus_1/en_1", "cus_1/en_2"]);
		await release("cus_1");
		await release("cus_1/en_2");
		await release("cus_1/en_3");

		expect(written).toEqual([
			"cus_1/en_1",
			"cus_1",
			"cus_1/en_2",
			"cus_1/en_3",
		]);
		expect(queue.counts()).toEqual({
			queued: 4,
			refreshed: 4,
			skipped: 0,
			failed: 0,
		});
		await queue.settled();
		expect(queue.depth()).toBe(0);
	});

	test("a subject already waiting is not queued twice, whichever evict names it", async () => {
		const { queue, started, release } = createScriptedReads();
		evict(queue, "cus_a", []);
		evict(queue, "cus_b", []);
		evict(queue, "cus_1", ["en_1", "en_2"]);
		evict(queue, "cus_2", []);
		evict(queue, "cus_1", ["en_2", "en_3"]);

		expect(queue.counts().queued).toBe(7);
		for (const subject of [
			"cus_a",
			"cus_b",
			"cus_1",
			"cus_1/en_1",
			"cus_1/en_2",
			"cus_2",
			"cus_1/en_3",
		])
			await release(subject);
		expect(started).toEqual([
			"cus_a",
			"cus_b",
			"cus_1",
			"cus_1/en_1",
			"cus_1/en_2",
			"cus_2",
			"cus_1/en_3",
		]);
	});

	test("a customer evicted again mid-read supersedes that read: nothing is written from it, and the subject reads again behind the evict", async () => {
		const { queue, started, written, release } = createScriptedReads();
		evict(queue, "cus_1", []);
		evict(queue, "cus_2", []);
		expect(started).toEqual(["cus_1", "cus_2"]);

		evict(queue, "cus_1", ["en_1"]);
		await release("cus_1");
		expect(written).toEqual([]);
		expect(queue.counts().skipped).toBe(1);

		await release("cus_2");
		await release("cus_1");
		await release("cus_1/en_1");
		expect(started).toEqual(["cus_1", "cus_2", "cus_1", "cus_1/en_1"]);
		expect(written).toEqual(["cus_2", "cus_1", "cus_1/en_1"]);
		expect(queue.counts()).toEqual({
			queued: 4,
			refreshed: 3,
			skipped: 1,
			failed: 0,
		});
	});

	test("an evict of another customer leaves a read in flight alone", async () => {
		const { queue, written, release } = createScriptedReads();
		evict(queue, "cus_1", []);
		evict(queue, "cus_2", []);
		await release("cus_1");
		expect(written).toEqual(["cus_1"]);
	});

	test("past the ceiling further subjects are dropped with one warning", async () => {
		const { queue, warnings, release } = createScriptedReads();
		const entityIds = Array.from(
			{ length: REFRESH_MAX_PENDING + 5 },
			(_, index) => `en_${index}`,
		);
		evict(queue, "cus_1", entityIds);

		expect(queue.depth()).toBe(REFRESH_MAX_PENDING);
		expect(queue.counts().queued).toBe(REFRESH_MAX_PENDING);
		expect(warnings).toHaveLength(1);
		expect((warnings[0] as [{ event: string }])[0].event).toBe(
			"balance_worker.snapshot_refresh_capped",
		);

		// Two reads are in flight, so two more subjects fit under the ceiling; cus_2's third is dropped, with no second warning.
		evict(queue, "cus_2", ["en_1", "en_2", "en_3"]);
		expect(queue.counts().queued).toBe(REFRESH_MAX_PENDING + 2);
		expect(queue.depth()).toBe(REFRESH_MAX_PENDING + REFRESH_CONCURRENCY);
		expect(warnings).toHaveLength(1);
		await release("cus_1");
		await release("cus_1/en_0");
		expect(queue.depth()).toBe(REFRESH_MAX_PENDING);
	});

	test("a read that throws is counted and logged; a read of a subject that is gone writes nothing; the queue carries on", async () => {
		const { queue, written, warnings, release, fail } = createScriptedReads();
		evict(queue, "cus_1", ["en_1", "en_2"]);
		await fail("cus_1");
		await release("cus_1/en_1", null);
		await release("cus_1/en_2");

		expect(written).toEqual(["cus_1/en_2"]);
		expect(queue.counts()).toEqual({
			queued: 3,
			refreshed: 1,
			skipped: 1,
			failed: 1,
		});
		expect((warnings[0] as [{ event: string }])[0].event).toBe(
			"balance_worker.snapshot_refresh_failed",
		);
		await queue.settled();
	});

	test("disposed: what waits is dropped, a read in flight writes nothing, and nothing new is taken", async () => {
		const { queue, written, release } = createScriptedReads();
		evict(queue, "cus_1", ["en_1", "en_2"]);
		queue.dispose();
		expect(queue.depth()).toBe(2);
		await release("cus_1");
		await release("cus_1/en_1");
		evict(queue, "cus_2", []);

		expect(written).toEqual([]);
		expect(queue.depth()).toBe(0);
		await queue.settled();
	});
});
