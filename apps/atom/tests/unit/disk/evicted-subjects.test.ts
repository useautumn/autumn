/**
 * Eviction end to end, against real slot files: what a check sees after a copy or a row is gone, and what the other
 * replicas see of it (nothing).
 *
 *  1  a row dropped from disk: the check is forwarded, the subject pulled once, the next check answers from the pull;
 *  2  a copy dropped from memory: the row answers at once, nothing is forwarded or pulled;
 *  3  two replicas: a drop on one relays nothing, deletes nothing on the other, and no pass copies the row back;
 *  4  a fresh replica copies what its peer still holds, then its own share drops it again;
 *  5  a multi-tenant Atom: one thread's share spans its tenants, so one tenant's churn drops another's oldest.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import {
	createDiskEvictor,
	DISK_IDLE_EXPIRY_MS,
	DISK_SHARE,
} from "../../../src/disk/createDiskEvictor.js";
import type { DiskEvictor } from "../../../src/disk/types/diskEvictor.js";
import { createMultiTenantAuth } from "../../../src/multiTenant/createMultiTenantAuth.js";
import { ANTI_ENTROPY_WINDOW_MS } from "../../../src/replication/createReplicaSync.js";
import {
	createDeployedFolders,
	createMultiTenantFolders,
} from "../../../src/replication/folders/createReplicaFolders.js";
import type { ReplicaFolders } from "../../../src/replication/types/replicaFolders.js";
import { openSlots } from "../../../src/slots/openSlots.js";
import { createHeldSubjects } from "../../../src/state/heldSubjects/createHeldSubjects.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import { createSubjectPulls } from "../../../src/subjectPulls/createSubjectPulls.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
	type ThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	heldEverywhere,
	type Replica,
	settle,
} from "../replication/replicaFixtures.js";
import {
	allSlotsOwnedHere,
	checkRequestFor,
	checkResponseOf,
	forwardingNowhere,
	forwardReasonOf,
	noSubjectPulls,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import { settleSqliteWrites } from "../utils/sqliteWriterTesting.js";

const HOUR = 3_600_000;
const quiet = { warn() {} };

const drainMicrotasks = settleSqliteWrites;

const folders: string[] = [];
const closers: (() => void)[] = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
	disconnect();
	cleanUpReplicas();
});

const customerAt = ({
	id,
	balance,
	readAt,
}: {
	id: string;
	balance: number;
	readAt: number;
}): StoredSubject => {
	const subject = storedSubjectWith({ balance, readAt });
	return {
		...subject,
		state: {
			...subject.state,
			identity: { ...subject.state.identity, customerId: id },
		},
	};
};

/** A thread's counters, read back as /health shows them. */
const threadCounters = () => {
	const buffer = createThreadStatsBuffer({ threads: 1 });
	return {
		counters: openThreadCounters({ buffer, index: 0 }),
		stats: (): ThreadStats => readThreadStats({ buffer })[0] as ThreadStats,
	};
};

/** The evictor over a volume whose 80% share is `shareBytes`, the folders' files standing in for what the volume sees. */
const evictorOver = ({
	folders: replicaFolders,
	counters,
	now,
	shareBytes = Number.MAX_SAFE_INTEGER,
}: {
	folders: Pick<ReplicaFolders, "all">;
	counters: ReturnType<typeof threadCounters>["counters"];
	now: () => number;
	shareBytes?: number;
}): DiskEvictor =>
	createDiskEvictor({
		ctx: {
			folders: replicaFolders,
			counters,
			logger: quiet,
			now,
			sleep: async () => {},
		},
		volumeOf: () => {
			const totalBytes =
				shareBytes === Number.MAX_SAFE_INTEGER
					? Number.MAX_SAFE_INTEGER
					: shareBytes / DISK_SHARE;
			const used = replicaFolders
				.all()
				.flatMap(({ slots }) => slots.ownedStores())
				.reduce((sum, store) => sum + store.dataBytes(), 0);
			return { totalBytes, availBytes: Math.max(0, totalBytes - used) };
		},
		threads: 1,
	});

/** One folder on one thread whose misses pull through an Autumn the test answers, with a held budget the test sets. */
const openFolder = ({ heldBudgetBytes = 64 * 1024 * 1024 } = {}) => {
	let at = 1_000_000;
	const { counters, stats } = threadCounters();
	const pulls: { customerId: string; answer(body: string): Promise<void> }[] =
		[];
	const subjectPulls = createSubjectPulls({
		ctx: {
			autumnClient: {
				readSubject: ({ customerId }) => {
					const reply = Promise.withResolvers<string>();
					pulls.push({
						customerId,
						answer: async (body) => {
							reply.resolve(body);
							await drainMicrotasks();
						},
					});
					return reply.promise;
				},
			},
			counters,
			logger: quiet,
			now: () => at,
		},
	});
	const folder = mkdtempSync(join(tmpdir(), "atom-evicted-"));
	folders.push(folder);
	const held = createHeldSubjects({
		budgetBytes: heldBudgetBytes,
		idleExpiryMs: 4 * HOUR,
		now: () => at,
	});
	const slots = openSlots({
		journalForwarder: forwardingNowhere,
		folder,
		slotCount: 2,
		owners: allSlotsOwnedHere,
		held,
		now: () => at,
		pulls: { subjectPulls, tokenHash: () => "hash" },
	});
	closers.push(() => slots.close());
	const processorOf = (id: string) => slots.processorFor({ customerId: id });
	return {
		held,
		pulls,
		stats,
		evictor: evictorOver({
			folders: createDeployedFolders({ slots }),
			counters,
			now: () => at,
		}),
		advance: (ms: number) => {
			at += ms;
		},
		push: (subject: StoredSubject) =>
			processorOf(subject.state.identity.customerId).setSubject(
				subjectPushOf({ subject }),
			),
		bodyOf: (subject: StoredSubject) => subjectPushOf({ subject }).body,
		check: (id: string) =>
			checkResponseOf({
				processor: processorOf(id),
				request: checkRequestFor({ params: { customer_id: id } }),
			}),
		forwardOf: (id: string) =>
			forwardReasonOf(() =>
				processorOf(id).check({
					request: checkRequestFor({ params: { customer_id: id } }),
				}),
			),
	};
};

describe("a subject dropped from disk", () => {
	test("its check is forwarded and pulls it once; the pull stores it, the next check answers from it, and the clock on its row restarts", async () => {
		const atom = openFolder();
		await atom.push(customerAt({ id: "cus_1", balance: 10, readAt: 100 }));
		expect(await atom.check("cus_1")).toMatchObject({
			balance: { remaining: 10 },
		});
		atom.advance(DISK_IDLE_EXPIRY_MS + HOUR);

		await atom.evictor.tick();

		expect(atom.stats()).toMatchObject({ diskExpired: 1 });
		expect(await atom.forwardOf("cus_1")).toBe("customer_not_stored");
		expect(atom.pulls.map((pull) => pull.customerId)).toEqual(["cus_1"]);
		// Autumn answers with the balance as it stands now, not as the dropped row had it.
		await atom.pulls[0]?.answer(
			atom.bodyOf(customerAt({ id: "cus_1", balance: 7, readAt: 200 })),
		);
		expect(await atom.check("cus_1")).toMatchObject({
			balance: { remaining: 7 },
		});
		expect(atom.stats()).toMatchObject({
			subjectMisses: 1,
			subjectPulls: 1,
			subjectFills: 1,
		});

		// Written again just now, the row is not idle: the next tick leaves it.
		await atom.evictor.tick();
		expect(atom.stats()).toMatchObject({ diskExpired: 1 });
		expect(await atom.forwardOf("cus_1")).toBeNull();
	});
});

describe("a copy dropped from memory", () => {
	test("for the budget: the check reads the row again and answers at once, forwarding and pulling nothing", async () => {
		const atom = openFolder({ heldBudgetBytes: 1 });
		await atom.push(customerAt({ id: "cus_1", balance: 10, readAt: 100 }));
		await atom.push(customerAt({ id: "cus_2", balance: 20, readAt: 100 }));
		expect(atom.held.size).toBe(1);
		expect(atom.held.evicted).toBe(1);

		expect(await atom.check("cus_1")).toMatchObject({
			balance: { remaining: 10 },
		});

		expect(atom.stats()).toMatchObject({ subjectMisses: 0, subjectPulls: 0 });
		expect(atom.pulls).toHaveLength(0);
	});

	test("for sitting idle: the same, and the row stays on disk for the next 7 days", async () => {
		const atom = openFolder();
		await atom.push(customerAt({ id: "cus_1", balance: 10, readAt: 100 }));
		atom.advance(5 * HOUR);
		atom.held.expireIdle();
		expect(atom.held.size).toBe(0);
		expect(atom.held.expired).toBe(1);

		await atom.evictor.tick();
		expect(await atom.check("cus_1")).toMatchObject({
			balance: { remaining: 10 },
		});

		expect(atom.stats()).toMatchObject({
			subjectMisses: 0,
			diskExpired: 0,
			diskEvicted: 0,
		});
		expect(atom.held.size).toBe(1);
	});
});

const SECRET_KEY = "Bearer am_sk_test_1";

const pushTo = ({
	replica,
	subject,
}: {
	replica: Replica;
	subject: StoredSubject;
}) =>
	replica.app.request("/v1/subjects.set", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": ATOM_TOKEN,
			[ATOM_CUSTOMER_ID_HEADER]: subject.state.identity.customerId,
		},
		body: subjectPushOf({ subject }).body,
	});

const remainingOn = async ({
	replica,
	id,
}: {
	replica: Replica;
	id: string;
}): Promise<number | "forwarded"> => {
	const reply = await replica.app.request("/v1/balances.check", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: SECRET_KEY,
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": LATEST_VERSION,
		},
		body: JSON.stringify({ customer_id: id, feature_id: "messages" }),
	});
	if (reply.headers.get("x-atom-forwarded")) return "forwarded";
	return (await reply.json()).balance.remaining;
};

describe("two replicas, one of which drops a row", () => {
	test("the drop relays nothing, the other replica keeps its row, and no later pass copies the row back", async () => {
		let now = 1_000_000;
		const clock = () => now;
		const a = createReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2"],
			now: clock,
		});
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: clock,
		});
		connect({ replicas: [a, b] });
		const { counters, stats } = threadCounters();
		const evictorOnA = evictorOver({
			folders: createDeployedFolders({ slots: a.slots }),
			counters,
			now: clock,
		});
		await pushTo({
			replica: a,
			subject: customerAt({ id: "cus_1", balance: 10, readAt: 100 }),
		});
		await settle();
		expect(await remainingOn({ replica: b, id: "cus_1" })).toBe(10);
		const relayedBefore = a.stats().relayed;

		now += DISK_IDLE_EXPIRY_MS + HOUR;
		await evictorOnA.tick();
		await settle();

		expect(stats()).toMatchObject({ diskExpired: 1 });
		expect(await heldEverywhere(a)).toEqual([]);
		expect(await heldEverywhere(b)).toEqual(["cus_1"]);
		expect(a.stats().relayed).toBe(relayedBefore);
		// A's checks go to the API now; B still answers.
		expect(await remainingOn({ replica: a, id: "cus_1" })).toBe("forwarded");
		expect(await remainingOn({ replica: b, id: "cus_1" })).toBe(10);

		// The row B holds was written long before any pass's window, so neither pass brings it back to A.
		await a.sync().pass();
		await b.sync().pass();
		expect(await heldEverywhere(a)).toEqual([]);
		expect(DISK_IDLE_EXPIRY_MS).toBeGreaterThan(ANTI_ENTROPY_WINDOW_MS);
	});

	test("a fresh replica copies what its peer still holds, and its own share drops it again", async () => {
		let now = 1_000_000;
		const clock = () => now;
		const a = createReplica({ address: "10.0.0.1", peers: [], now: clock });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: clock,
		});
		connect({ replicas: [a, b] });
		for (let i = 0; i < 20; i++)
			await pushTo({
				replica: a,
				subject: customerAt({ id: `cus_${i}`, balance: i, readAt: 100 + i }),
			});
		now += HOUR;

		await b.sync().catchUp();
		expect((await heldEverywhere(b)).length).toBe(20);
		// Copied just now, the rows are inside the relay window; a share only drops them once they are past it.
		now += HOUR;

		const { counters, stats } = threadCounters();
		const evictorOnB = evictorOver({
			folders: createDeployedFolders({ slots: b.slots }),
			counters,
			now: clock,
			shareBytes: 1,
		});
		await evictorOnB.tick();
		expect(stats().diskEvicted).toBeGreaterThan(0);
		expect((await heldEverywhere(b)).length).toBeLessThan(20);
		expect((await heldEverywhere(a)).length).toBe(20);
	});
});

describe("a multi-tenant Atom", () => {
	test("one thread's share spans every tenant: churn in one drops the oldest rows of another, whose checks then pull", async () => {
		let at = 1_000_000;
		const dataDir = mkdtempSync(join(tmpdir(), "atom-mt-evicted-"));
		folders.push(dataDir);
		const { counters, stats } = threadCounters();
		const auth = createMultiTenantAuth({
			journalForwarder: forwardingNowhere,
			dataDir,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			heldSubjects: createHeldSubjects({ budgetBytes: 64 * 1024 * 1024 }),
			subjectPulls: noSubjectPulls,
			now: () => at,
		});
		closers.push(() => auth.close());
		auth.putAtom({ id: "org_quiet", tokenHash: "a".repeat(64) });
		auth.putAtom({ id: "org_busy", tokenHash: "b".repeat(64) });
		const slotsOf = (id: string) => {
			const slots = auth.slotsFor({ atomId: id });
			if (!slots) throw new Error(`no folder ${id}`);
			return slots;
		};
		const push = async ({ atomId, id }: { atomId: string; id: string }) =>
			slotsOf(atomId)
				.processorFor({ customerId: id })
				.setSubject(
					subjectPushOf({
						subject: customerAt({ id, balance: 1, readAt: at }),
					}),
				);
		const isStored = async ({ atomId, id }: { atomId: string; id: string }) =>
			(
				await Promise.all(
					[0, 1].map((slot) =>
						slotsOf(atomId).fetchSubjects({
							slot,
							keys: [{ customerId: id, entityId: "" }],
						}),
					),
				)
			).some((rows) => rows.length > 0);
		for (let i = 0; i < 10; i++)
			await push({ atomId: "org_quiet", id: `q_${i}` });
		at += HOUR;
		const sizing = evictorOver({
			folders: createMultiTenantFolders({ auth }),
			counters,
			now: () => at,
		});
		await sizing.tick();
		const quietBytes = stats().diskBytes;
		for (let i = 0; i < 40; i++)
			await push({ atomId: "org_busy", id: `b_${i}` });
		at += HOUR;

		const evictor = evictorOver({
			folders: createMultiTenantFolders({ auth }),
			counters,
			now: () => at,
			shareBytes: quietBytes * 3,
		});
		for (let tick = 0; tick < 10; tick++) await evictor.tick();

		expect(stats().diskBytes).toBeLessThanOrEqual(quietBytes * 3);
		expect(stats().diskEvicted).toBeGreaterThan(0);
		expect(await isStored({ atomId: "org_quiet", id: "q_0" })).toBe(false);
		expect(await isStored({ atomId: "org_busy", id: "b_39" })).toBe(true);
	});
});
