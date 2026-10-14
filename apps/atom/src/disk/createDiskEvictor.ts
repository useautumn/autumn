import { ANTI_ENTROPY_WINDOW_MS } from "../replication/createReplicaSync.js";
import type { SqliteStore } from "../state/types/sqliteStore.js";
import type { DiskEvictor, DiskEvictorContext } from "./types/diskEvictor.js";

const TICK_MS = 10_000;
export const DISK_SHARE = 0.8;
const DISK_SHARE_FLOOR = 0.95;
export const DISK_IDLE_EXPIRY_MS = 7 * 24 * 3_600_000;
export const DISK_MIN_AGE_MS = 2 * ANTI_ENTROPY_WINDOW_MS + 60_000;
export const DISK_EVICT_BATCH = 25;
export const DISK_EVICT_FILES_PER_TICK = 64;

type Mode = "idle" | "evicting";

export type VolumeBytes = { totalBytes: number; availBytes: number };

export const createDiskEvictor = ({
	ctx,
	volumeOf,
	threads,
}: {
	ctx: DiskEvictorContext;
	volumeOf: () => VolumeBytes;
	threads: number;
}): DiskEvictor => {
	const now = ctx.now ?? Date.now;
	const sleep = ctx.sleep ?? Bun.sleep;
	let mode: Mode = "idle";
	let dropsYoung = false;
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
			const { customers } = store.dropCustomersWrittenBefore({
				before,
				limit: DISK_EVICT_BATCH,
			});
			freed += sizeBefore - store.dataBytes();
			dropped += customers;
			ctx.counters.add(
				mode === "idle" ? "diskExpired" : "diskEvicted",
				customers,
			);
			await sleep(0);
		}
		bytes -= freed;
		ctx.counters.set("diskBytes", bytes);
		if (mode === "idle") dropsYoung = false;
		else if (dropped === 0) pressed({ used });
	}

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
