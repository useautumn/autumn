import { ANTI_ENTROPY_WINDOW_MS } from "../replication/createReplicaSync.js";
import type { SqliteStore } from "../state/types/sqliteStore.js";
import type { DiskEvictor, DiskEvictorContext } from "./types/diskEvictor.js";

const TICK_MS = 10_000;
/** The volume may be this full before customers are dropped; the rest is the filesystem's reserve and a tick's headroom. */
export const DISK_SHARE = 0.8;
/** Over the share, the threads drop customers until the volume is back under this much of it. */
const DISK_SHARE_FLOOR = 0.95;
/** A customer Autumn has not pushed for this long is dropped even under the share; its next check pulls it back. */
export const DISK_IDLE_EXPIRY_MS = 7 * 24 * 3_600_000;
/** A relay can reach a peer one anti-entropy window late, and the pass back here looks one more window back: no late copy of a row this old is still on its way. */
export const DISK_MIN_AGE_MS = 2 * ANTI_ENTROPY_WINDOW_MS + 60_000;
/** Customers dropped per file per tick: about 6 ms of the serving thread per file, whatever the file holds. */
export const DISK_EVICT_BATCH = 25;
/** Files one tick visits, so a thread far over the share catches up over a few ticks instead of one long one. */
export const DISK_EVICT_FILES_PER_TICK = 64;

/** Under the share only idle customers go; over it, the oldest go until the floor is reached. */
type Mode = "idle" | "evicting";

export type VolumeBytes = { totalBytes: number; availBytes: number };

export const createDiskEvictor = ({
	ctx,
	volumeOf,
	threads,
}: {
	ctx: DiskEvictorContext;
	/** The volume the data folder is on, read at each tick: what the files, their logs and everything else take, as the volume sees it. */
	volumeOf: () => VolumeBytes;
	/** Every thread drops its part of what is over, so each takes a share of the deficit. */
	threads: number;
}): DiskEvictor => {
	const now = ctx.now ?? Date.now;
	const sleep = ctx.sleep ?? Bun.sleep;
	let mode: Mode = "idle";
	/** Set once an evicting pass found nothing past the guard: a full volume is the worse failure, so recent rows go too. */
	let dropsYoung = false;
	/** Where the next pass starts: a pass that stops at its deficit would otherwise drain the first files alone. */
	let nextStore = 0;
	let stopped = false;

	const ownedStores = (): SqliteStore[] =>
		ctx.folders.all().flatMap(({ slots }) => slots.ownedStores());

	function modeAfter({ used, cap }: { used: number; cap: number }): Mode {
		if (used > cap) return "evicting";
		return mode === "evicting" && used > cap * DISK_SHARE_FLOOR
			? "evicting"
			: "idle";
	}

	function cutoffAt({ at }: { at: number }): number {
		if (mode === "idle") return at - DISK_IDLE_EXPIRY_MS;
		return dropsYoung ? at : at - DISK_MIN_AGE_MS;
	}

	function pressed({ used }: { used: number }): void {
		if (dropsYoung) return;
		dropsYoung = true;
		ctx.logger.warn(
			{ type: "atom_disk_pressure", data: { used } },
			"Over the disk share with nothing older than the relay window: dropping recent customers",
		);
	}

	/** Dropped rows free the volume only once the main thread checkpoints the file, so a pass frees its part of the deficit by the files' own count. */
	async function tick(): Promise<void> {
		const volume = volumeOf();
		if (volume.totalBytes === 0) {
			ctx.logger.warn(
				{ type: "atom_disk_unknown" },
				"Cannot read the volume the data folder is on; dropping nothing this tick",
			);
			return;
		}
		const used = volume.totalBytes - volume.availBytes;
		const cap = volume.totalBytes * DISK_SHARE;
		mode = modeAfter({ used, cap });
		const deficitShare = (used - cap * DISK_SHARE_FLOOR) / threads;
		const stores = ownedStores();
		let bytes = stores.reduce((sum, store) => sum + store.dataBytes(), 0);
		ctx.counters.set("diskBytes", bytes);
		const before = cutoffAt({ at: now() });
		let dropped = 0;
		let freed = 0;
		const first = nextStore;
		const visits = Math.min(stores.length, DISK_EVICT_FILES_PER_TICK);
		for (let step = 0; step < visits; step++) {
			if (stopped) return;
			if (mode === "evicting" && freed >= deficitShare) break;
			const index = (first + step) % stores.length;
			const store = stores[index] as SqliteStore;
			nextStore = (index + 1) % stores.length;
			const sizeBefore = store.dataBytes();
			const { customers } = await store.dropCustomersWrittenBefore({
				before,
				limit: DISK_EVICT_BATCH,
			});
			freed += sizeBefore - store.dataBytes();
			dropped += customers;
			ctx.counters.add(
				mode === "idle" ? "diskExpired" : "diskEvicted",
				customers,
			);
			// Between files, so checks queued behind a batch are answered.
			await sleep(0);
		}
		bytes -= freed;
		ctx.counters.set("diskBytes", bytes);
		if (mode === "idle") dropsYoung = false;
		else if (dropped === 0) pressed({ used });
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
