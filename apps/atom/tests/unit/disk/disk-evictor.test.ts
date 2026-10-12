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
	diskShareBytesOf,
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
		dataDir,
		tokenHash: "0".repeat(64),
		slotCount: 2,
		owners: allSlotsOwnedHere,
		held,
		now: () => at,
		subjectPulls: noSubjectPulls,
	});
	const warnings: string[] = [];
	const evictorOf = ({ shareBytes }: { shareBytes: number }) =>
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
			shareBytes,
		});
	const push = ({ ids }: { ids: string[] }) => {
		for (const id of ids)
			auth.slots
				.processorFor({ customerId: id })
				.setSubject({ customerId: id, body: body(id) });
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
	test("each thread's share is its part of 80% of the volume, read from the mount, never a setting", () => {
		const volume = readVolumeBytes({ path: tmpdir() });
		expect(volume.totalBytes).toBeGreaterThan(0);
		expect(volume.availBytes).toBeLessThanOrEqual(volume.totalBytes);
		expect(diskShareBytesOf({ volumeBytes: 100_000_000_000, threads: 7 })).toBe(
			Math.floor(80_000_000_000 / 7),
		);
	});

	test("under its share it only drops customers not pushed for 7 days, and reports the bytes its files take", async () => {
		const folder = openFolder();
		folder.push({ ids: ids("old", 20) });
		folder.advance(DISK_IDLE_EXPIRY_MS - HOUR);
		folder.push({ ids: ids("fresh", 20) });
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
		folder.push({ ids: ids("a", 100) });
		folder.advance(HOUR);
		folder.push({ ids: ids("b", 100) });
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

	test("a customer's held copy goes with its rows", async () => {
		const folder = openFolder();
		folder.push({ ids: ids("c", 10) });
		folder.advance(DAY * 8);
		expect(folder.held.size).toBe(10);

		await folder.evictorOf({ shareBytes: Number.MAX_SAFE_INTEGER }).tick();

		expect(folder.held.size).toBe(0);
		folder.close();
	});

	test("over its share with nothing older than the relay window, it warns and drops the oldest anyway rather than fill the volume", async () => {
		const folder = openFolder();
		folder.push({ ids: ids("young", 50) });
		folder.advance(DISK_MIN_AGE_MS / 2);
		const evictor = folder.evictorOf({ shareBytes: ROW_BYTES * 10 });

		await evictor.tick();
		expect(folder.stats().diskEvicted).toBe(0);
		await evictor.tick();

		expect(folder.stats().diskEvicted).toBeGreaterThan(0);
		expect(folder.warnings).toEqual([
			"Over its disk share with nothing older than the relay window: dropping recent customers",
		]);
		folder.close();
	});

	test("one tick looks at a bounded number of rows per file, so a tick's cost is bounded whatever the files hold", async () => {
		const folder = openFolder();
		folder.push({ ids: ids("d", DISK_EVICT_BATCH * 3) });
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
