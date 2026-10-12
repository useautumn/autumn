import { ANTI_ENTROPY_WINDOW_MS } from "../replication/createReplicaSync.js";
import type { SqliteStore } from "../state/types/sqliteStore.js";
import type { DiskEvictor, DiskEvictorContext } from "./types/diskEvictor.js";

const TICK_MS = 10_000;
/** Atom's files may take this much of the volume; the rest is the logs' slack, the filesystem's reserve and headroom. */
export const DISK_SHARE = 0.8;
/** Over its share, a thread drops customers until it is back under this much of it. */
const DISK_SHARE_FLOOR = 0.95;
/** A customer Autumn has not pushed for this long is dropped even under the share; its next check pulls it back. */
export const DISK_IDLE_EXPIRY_MS = 7 * 24 * 3_600_000;
/** A relay can reach a peer one anti-entropy window late, and the pass back here looks one more window back: no late copy of a row this old is still on its way. */
export const DISK_MIN_AGE_MS = 2 * ANTI_ENTROPY_WINDOW_MS + 60_000;
/** Customers dropped per file per tick: about 6 ms of the serving thread per file, whatever the file holds. */
export const DISK_EVICT_BATCH = 25;
/** Files one tick visits, so a thread far over its share catches up over a few ticks instead of one long one. */
export const DISK_EVICT_FILES_PER_TICK = 64;

/** A thread's part of what the volume allows every thread together. */
export const diskShareBytesOf = ({
	volumeBytes,
	threads,
}: {
	volumeBytes: number;
	threads: number;
}): number => Math.floor((volumeBytes * DISK_SHARE) / threads);

/** Under the share only idle customers go; over it, the oldest go until the floor is reached. */
type Mode = "idle" | "evicting";

export const createDiskEvictor = ({
	ctx,
	shareOf,
}: {
	ctx: DiskEvictorContext;
	/** This thread's share of the volume, read at each tick so a volume grown online counts at once; 0 when it cannot be read. */
	shareOf: () => number;
}): DiskEvictor => {
	const now = ctx.now ?? Date.now;
	const sleep = ctx.sleep ?? Bun.sleep;
	let shareBytes = 0;
	let mode: Mode = "idle";
	/** Set once an evicting pass found nothing past the guard: a full volume is the worse failure, so recent rows go too. */
	let dropsYoung = false;
	/** Where the next pass starts: a pass that stops at the floor would otherwise drain the first files alone. */
	let nextStore = 0;
	let stopped = false;

	const ownedStores = (): SqliteStore[] =>
		ctx.folders.all().flatMap(({ slots }) => slots.ownedStores());

	function modeAfter({ bytes }: { bytes: number }): Mode {
		if (bytes > shareBytes) return "evicting";
		return mode === "evicting" && bytes > shareBytes * DISK_SHARE_FLOOR
			? "evicting"
			: "idle";
	}

	function cutoffAt({ at }: { at: number }): number {
		if (mode === "idle") return at - DISK_IDLE_EXPIRY_MS;
		return dropsYoung ? at : at - DISK_MIN_AGE_MS;
	}

	function pressed(): void {
		if (dropsYoung) return;
		dropsYoung = true;
		ctx.logger.warn(
			{ type: "atom_disk_pressure", data: { shareBytes } },
			"Over its disk share with nothing older than the relay window: dropping recent customers",
		);
	}

	/** An unreadable volume keeps the last share known; with none known yet, nothing is dropped: a 0 share would drain every file. */
	function readShare(): boolean {
		const share = shareOf();
		if (share > 0) {
			shareBytes = share;
			return true;
		}
		ctx.logger.warn(
			{ type: "atom_disk_share_unknown", data: { shareBytes } },
			"Cannot read the volume the data folder is on; keeping the last disk share known",
		);
		return shareBytes > 0;
	}

	async function tick(): Promise<void> {
		if (!readShare()) return;
		const stores = ownedStores();
		const sizes = stores.map((store) => store.dataBytes());
		let bytes = sizes.reduce((sum, size) => sum + size, 0);
		ctx.counters.set("diskBytes", bytes);
		mode = modeAfter({ bytes });
		const before = cutoffAt({ at: now() });
		let dropped = 0;
		const first = nextStore;
		const visits = Math.min(stores.length, DISK_EVICT_FILES_PER_TICK);
		for (let step = 0; step < visits; step++) {
			if (stopped) return;
			if (mode === "evicting" && bytes <= shareBytes * DISK_SHARE_FLOOR) break;
			const index = (first + step) % stores.length;
			const store = stores[index] as SqliteStore;
			nextStore = (index + 1) % stores.length;
			const { customers } = store.dropCustomersWrittenBefore({
				before,
				limit: DISK_EVICT_BATCH,
			});
			bytes += store.dataBytes() - (sizes[index] ?? 0);
			dropped += customers;
			ctx.counters.add(
				mode === "idle" ? "diskExpired" : "diskEvicted",
				customers,
			);
			// Between files, so checks queued behind a batch are answered.
			await sleep(0);
		}
		ctx.counters.set("diskBytes", bytes);
		if (mode === "idle") dropsYoung = false;
		else if (dropped === 0) pressed();
	}

	/** A tick that fails (a full volume, a tenant's folder closing under it) is logged and tried again next tick, never fatal to the thread. */
	async function run(): Promise<void> {
		while (!stopped) {
			await sleep(TICK_MS);
			if (stopped) return;
			try {
				await tick();
			} catch (error) {
				ctx.logger.warn(
					{ type: "atom_disk_evict_failed", error },
					"Could not run a disk eviction tick",
				);
			}
		}
	}

	return {
		tick,
		run,
		stop: () => {
			stopped = true;
		},
	};
};
