import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import {
	createDiskEvictor,
	DISK_EVICT_BATCH,
	DISK_IDLE_EXPIRY_MS,
	DISK_MIN_AGE_MS,
	DISK_SHARE,
	type VolumeBytes,
} from "../../../src/disk/createDiskEvictor.js";
import { readVolumeBytes } from "../../../src/disk/readVolumeBytes.js";
import { createDeployedFolders } from "../../../src/replication/folders/createReplicaFolders.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	forwardingNowhere,
	freshHeld,
	noSubjectPulls,
	storedSubjectWith,
} from "../utils/atomFixtures.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A subject of the fixture shape takes about this much on disk, log included; the tests size caps from it. */
const ROW_BYTES = 6_000;

const customer = ({ id, readAt }: { id: string; readAt: number }) => {
	const subject = storedSubjectWith({ balance: 10, readAt });
	return {
		...subject,
		state: {
			...subject.state,
			identity: { ...subject.state.identity, customerId: id },
		},
	};
};

const openFolder = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-evict-"));
	let at = 1_000_000;
	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const held = freshHeld();
	const auth = createDeployedAuth({
		journalForwarder: forwardingNowhere,
		dataDir,
		tokenHash: "0".repeat(64),
		slotCount: 2,
		owners: allSlotsOwnedHere,
		held,
		now: () => at,
		subjectPulls: noSubjectPulls,
	});
	const warnings: string[] = [];
	const dataBytes = () =>
		auth.slots.ownedStores().reduce((sum, store) => sum + store.dataBytes(), 0);
	/** A volume whose 80% share is `shareBytes`, with the folder's files on it: what the files hold stands in for what the volume sees. */
	const volumeWithShare = (shareBytes: number): VolumeBytes => {
		const totalBytes =
			shareBytes === Number.MAX_SAFE_INTEGER
				? Number.MAX_SAFE_INTEGER
				: shareBytes / DISK_SHARE;
		return { totalBytes, availBytes: Math.max(0, totalBytes - dataBytes()) };
	};
	const evictorOf = ({
		shareBytes,
		volumeOf = () => volumeWithShare(shareBytes),
	}: {
		shareBytes: number;
		volumeOf?: () => VolumeBytes;
	}) =>
		createDiskEvictor({
			ctx: {
				folders: createDeployedFolders({ slots: auth.slots }),
				counters,
				logger: {
					warn: (...args: unknown[]) => {
						warnings.push(String(args[1]));
					},
				},
				now: () => at,
				sleep: async () => {},
			},
			volumeOf,
			threads: 1,
		});
	const push = async ({ ids }: { ids: string[] }) => {
		await Promise.all(
			ids.map((id) =>
				auth.slots
					.processorFor({ customerId: id })
					.setSubject({ customerId: id, body: body(id) }),
			),
		);
	};
	const body = (id: string) =>
		JSON.stringify({
			state: customer({ id, readAt: at }).state,
			catalog: customer({ id, readAt: at }).catalog,
			org: customer({ id, readAt: at }).org,
			log_offset: "1",
			read_at: at,
		});
	const stored = (id: string) =>
		auth.slots.fetchSubjects({
			slot: 0,
			keys: [{ customerId: id, entityId: "" }],
		});
	return {
		auth,
		held,
		warnings,
		evictorOf,
		volumeWithShare,
		push,
		advance: (ms: number) => {
			at += ms;
		},
		stats: () => readThreadStats({ buffer: threadStats })[0],
		isStored: async (id: string) =>
			(
				await Promise.all(
					[0, 1].map((slot) =>
						auth.slots.fetchSubjects({
							slot,
							keys: [{ customerId: id, entityId: "" }],
						}),
					),
				)
			).some((rows) => rows.length > 0),
		close: () => {
			auth.close();
			rmSync(dataDir, { recursive: true, force: true });
		},
		stored,
	};
};

const ids = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, i) => `${prefix}_${i}`);

describe("the disk evictor", () => {
	test("the volume is read from the mount, never a setting; one that cannot be read is zeros", () => {
		const volume = readVolumeBytes({ path: tmpdir() });
		expect(volume.totalBytes).toBeGreaterThan(0);
		expect(volume.availBytes).toBeLessThanOrEqual(volume.totalBytes);
		expect(readVolumeBytes({ path: "/nowhere/at/all" })).toEqual({
			totalBytes: 0,
			availBytes: 0,
		});
	});

	test("under its share it only drops customers not pushed for 7 days, and reports the bytes its files take", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("old", 20) });
		folder.advance(DISK_IDLE_EXPIRY_MS - HOUR);
		await folder.push({ ids: ids("fresh", 20) });
		const evictor = folder.evictorOf({ shareBytes: Number.MAX_SAFE_INTEGER });

		await evictor.tick();
		expect(folder.stats().diskExpired).toBe(0);
		expect(folder.stats().diskBytes).toBeGreaterThan(40 * 1_000);

		folder.advance(2 * HOUR);
		await evictor.tick();

		expect(folder.stats().diskExpired).toBe(20);
		expect(folder.stats().diskEvicted).toBe(0);
		expect(await folder.isStored("old_0")).toBe(false);
		expect(await folder.isStored("fresh_0")).toBe(true);
		folder.close();
	});

	test("over its share it drops the least recently pushed customers, whole, down to 95% of the share, then stops", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("a", 100) });
		folder.advance(HOUR);
		await folder.push({ ids: ids("b", 100) });
		folder.advance(HOUR);
		const bytes = () => folder.stats().diskBytes;
		await folder.evictorOf({ shareBytes: Number.MAX_SAFE_INTEGER }).tick();
		const full = bytes();
		expect(full).toBeGreaterThan(1_000_000);
		const share = Math.floor(full * 0.6);
		const bounded = folder.evictorOf({ shareBytes: share });

		for (let tick = 0; tick < 20; tick++) await bounded.tick();

		expect(bytes()).toBeLessThan(share);
		expect(bytes()).toBeGreaterThan(share * 0.5);
		expect(folder.stats().diskEvicted).toBeGreaterThan(0);
		expect(await folder.isStored("a_0")).toBe(false);
		expect(await folder.isStored("b_99")).toBe(true);
		const evictedSoFar = folder.stats().diskEvicted;
		await bounded.tick();
		expect(folder.stats().diskEvicted).toBe(evictedSoFar);
		folder.close();
	});

	test("each pass starts where the last one stopped, so a share reached in one file's batch does not drain that file alone", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("r", 400) });
		folder.advance(HOUR);
		await folder.evictorOf({ shareBytes: Number.MAX_SAFE_INTEGER }).tick();
		const full = folder.stats().diskBytes;
		const countIn = async (slot: number) =>
			(
				await folder.auth.slots.listSince({
					slot,
					after: null,
					cursor: null,
					limit: 10_000,
				})
			).length;
		const before = [await countIn(0), await countIn(1)];
		// One file's batch frees more than the deficit each tick.
		const evictor = folder.evictorOf({ shareBytes: Math.floor(full * 0.999) });

		await evictor.tick();
		const afterFirst = [await countIn(0), await countIn(1)];
		// A few more pushes put the volume over again by less than one batch: the next pass takes it from the other file.
		await folder.push({ ids: ids("s", 6) });
		folder.advance(HOUR);
		await evictor.tick();
		const afterSecond = [await countIn(0), await countIn(1)];

		expect(afterFirst[0]).toBe((before[0] ?? 0) - DISK_EVICT_BATCH);
		expect(afterFirst[1]).toBe(before[1]);
		expect(afterSecond[0]).toBeGreaterThanOrEqual(afterFirst[0] ?? 0);
		expect(afterSecond[1]).toBeLessThan(afterFirst[1] ?? 0);
		folder.close();
	});

	test("a customer's held copy goes with its rows", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("c", 10) });
		folder.advance(DAY * 8);
		expect(folder.held.size).toBe(10);

		await folder.evictorOf({ shareBytes: Number.MAX_SAFE_INTEGER }).tick();

		expect(folder.held.size).toBe(0);
		folder.close();
	});

	test("over its share with nothing older than the relay window, it warns once and drops the oldest anyway rather than fill the volume", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("young", DISK_EVICT_BATCH * 3) });
		folder.advance(DISK_MIN_AGE_MS / 2);
		const evictor = folder.evictorOf({ shareBytes: ROW_BYTES * 10 });

		await evictor.tick();
		expect(folder.stats().diskEvicted).toBe(0);
		await evictor.tick();
		const afterFirstDrop = folder.stats().diskEvicted;
		await evictor.tick();

		expect(afterFirstDrop).toBeGreaterThan(0);
		// Every pass under the same pressure drops, and the warning is not repeated.
		expect(folder.stats().diskEvicted).toBeGreaterThan(afterFirstDrop);
		expect(folder.warnings).toEqual([
			"Over the disk share with nothing older than the relay window: dropping recent customers",
		]);
		folder.close();
	});

	test("the volume is read at every tick, so one grown online counts at once", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("g", 60) });
		folder.advance(HOUR);
		let share = ROW_BYTES * 5;
		const evictor = folder.evictorOf({
			shareBytes: 0,
			volumeOf: () => folder.volumeWithShare(share),
		});

		await evictor.tick();
		const droppedWhileSmall = folder.stats().diskEvicted;
		share = Number.MAX_SAFE_INTEGER;
		await folder.push({ ids: ids("h", 60) });
		folder.advance(HOUR);
		await evictor.tick();

		expect(droppedWhileSmall).toBeGreaterThan(0);
		expect(folder.stats().diskEvicted).toBe(droppedWhileSmall);
		folder.close();
	});

	test("a volume it cannot read drops nothing that tick and warns: a 0-byte volume would read as full and drain every file", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("u", 60) });
		folder.advance(DISK_IDLE_EXPIRY_MS + HOUR);
		let readable = false;
		const evictor = folder.evictorOf({
			shareBytes: ROW_BYTES * 5,
			volumeOf: () =>
				readable
					? folder.volumeWithShare(ROW_BYTES * 5)
					: { totalBytes: 0, availBytes: 0 },
		});

		await evictor.tick();
		expect(folder.stats().diskEvicted + folder.stats().diskExpired).toBe(0);
		expect(await folder.isStored("u_0")).toBe(true);
		readable = true;
		await evictor.tick();

		expect(folder.stats().diskEvicted).toBeGreaterThan(0);
		expect(folder.warnings).toEqual([
			"Cannot read the volume the data folder is on; dropping nothing this tick",
		]);
		folder.close();
	});

	test("a tick that throws is logged and the next tick still runs, so a full volume never takes the thread down", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("e", 5) });
		folder.advance(DAY * 8);
		let ticks = 0;
		const sleeps: number[] = [];
		const evictor = createDiskEvictor({
			ctx: {
				folders: {
					all: () => {
						if (++ticks === 1) throw new Error("disk full");
						return [{ atomId: null, slots: folder.auth.slots }];
					},
				},
				counters: { add() {}, set() {} },
				logger: {
					warn: (...args: unknown[]) => {
						folder.warnings.push(String(args[1]));
					},
				},
				now: () => 0,
				sleep: async (ms) => {
					sleeps.push(ms);
					if (sleeps.length > 3) evictor.stop();
				},
			},
			volumeOf: () => ({
				totalBytes: Number.MAX_SAFE_INTEGER,
				availBytes: Number.MAX_SAFE_INTEGER,
			}),
			threads: 1,
		});

		await evictor.run();

		expect(ticks).toBe(2);
		expect(folder.warnings).toEqual(["Could not run a disk eviction tick"]);
		folder.close();
	});

	test("one tick looks at a bounded number of rows per file, so a tick's cost is bounded whatever the files hold", async () => {
		const folder = openFolder();
		await folder.push({ ids: ids("d", DISK_EVICT_BATCH * 3) });
		folder.advance(DAY * 8);

		await folder.evictorOf({ shareBytes: Number.MAX_SAFE_INTEGER }).tick();

		// Two slot files, one batch each.
		expect(folder.stats().diskExpired).toBeLessThanOrEqual(
			DISK_EVICT_BATCH * 2,
		);
		expect(folder.stats().diskExpired).toBeGreaterThan(0);
		folder.close();
	});
});
