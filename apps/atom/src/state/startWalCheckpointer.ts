import type { Database } from "bun:sqlite";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { newSqliteConnection } from "./newSqliteConnection.js";

const TICK_MS = 1000;
/**
 * Each file is checkpointed once per this many ticks, a slice of the files each tick. A completed checkpoint makes the
 * next write restart the log, and that restart syncs the log header on the writing (serving) thread.
 */
export const TICKS_PER_FILE = 30;
/** A log past this is copied on the next tick, ahead of its turn: one hot file's 30 s of writes came back as a 163 MB
 * burst that stalled the loop for a second (rig, 2026-10-14); 16 MB every few seconds does not. */
export const CHECKPOINT_WAL_BYTES = 4 * 1024 * 1024;
/** BENCH ONLY (#369 pacing spike, never merge): log bytes copied per tick on average, so the copies never burst past
 * the volume's throughput; a tick may overdraw, and the next ones wait until the budget recovers. */
const COPY_BYTES_PER_TICK = 24 * 1024 * 1024;
const WAL_SUFFIX = "-wal";

const walBytesOf = ({ path }: { path: string }): number => {
	try {
		return statSync(`${path}${WAL_SUFFIX}`).size;
	} catch {
		return 0;
	}
};

const listWalDatabases = ({ dataDir }: { dataDir: string }): string[] => {
	try {
		return readdirSync(dataDir, { recursive: true, encoding: "utf8" })
			.filter((name) => name.endsWith(`.sqlite${WAL_SUFFIX}`))
			.map((name) => join(dataDir, name.slice(0, -WAL_SUFFIX.length)));
	} catch {
		return [];
	}
};

/**
 * Copies every SQLite log in the data folder back into its file, from the main thread, which serves nothing.
 * A checkpoint writes and syncs megabytes; done by a serving thread, it stalls every request queued behind that push.
 */
export const startWalCheckpointer = ({
	dataDir,
	logger,
}: {
	dataDir: string;
	logger: {
		warn(fields: object, message: string): void;
		info?(fields: object, message: string): void;
	};
}): { checkpoint(): void; stop(): void } => {
	const open = new Map<string, Database>();
	const failing = new Set<string>();

	function checkpointOne({ path }: { path: string }): void {
		try {
			let database = open.get(path);
			if (!database) {
				database = newSqliteConnection({
					path,
					options: { readwrite: true, create: false },
				});
				open.set(path, database);
			}
			// Passive never waits on a reader or writer: what it cannot copy now it copies next time. The log is never cut
			// here: the writer reuses its blocks from the start, so no checkpoint regrows it.
			database.run("PRAGMA wal_checkpoint(PASSIVE)");
			failing.delete(path);
		} catch (error) {
			open.get(path)?.close();
			open.delete(path);
			if (failing.has(path)) return;
			failing.add(path);
			logger.warn(
				{ type: "atom_wal_checkpoint_failed", error, data: { path } },
				`Could not checkpoint ${path}`,
			);
		}
	}

	let tick = 0;
	/** Files whose turn came while the budget was spent: copied first, oldest turn first, once it recovers. */
	const due = new Set<string>();
	let budget = COPY_BYTES_PER_TICK;

	function checkpoint(): void {
		const paths = listWalDatabases({ dataDir }).sort();
		const listed = new Set(paths);
		for (const [path, database] of open)
			if (!listed.has(path)) {
				database.close();
				open.delete(path);
			}
		// BENCH ONLY (#369 rig diagnosis, never merge): each tick's checkpoint time and the log bytes it found.
		const startedAt = performance.now();
		let files = 0;
		let walBytes = 0;
		let maxMs = 0;
		paths.forEach((path, index) => {
			if (index % TICKS_PER_FILE === tick % TICKS_PER_FILE) due.add(path);
		});
		budget = Math.min(budget + COPY_BYTES_PER_TICK, 2 * COPY_BYTES_PER_TICK);
		const sizes = new Map(paths.map((path) => [path, walBytesOf({ path })]));
		const early = paths.filter(
			(path) => !due.has(path) && (sizes.get(path) ?? 0) > CHECKPOINT_WAL_BYTES,
		);
		for (const path of [...early, ...due]) {
			if (budget <= 0) break;
			due.delete(path);
			if (!listed.has(path)) continue;
			const size = sizes.get(path) ?? 0;
			if (size === 0) continue;
			const fileStartedAt = performance.now();
			walBytes += size;
			budget -= size;
			checkpointOne({ path });
			files++;
			maxMs = Math.max(maxMs, performance.now() - fileStartedAt);
		}
		const ms = performance.now() - startedAt;
		if (ms >= 20)
			logger.info?.(
				{
					type: "atom_rig_wal_checkpoint_tick",
					data: {
						tick,
						files,
						due: due.size,
						walBytes,
						ms: Math.round(ms),
						maxMs: Math.round(maxMs),
					},
				},
				"WAL checkpoint tick",
			);
		tick += 1;
	}

	const timer = setInterval(checkpoint, TICK_MS);
	timer.unref?.();

	return {
		checkpoint,
		stop: () => {
			clearInterval(timer);
			for (const database of open.values()) database.close();
			open.clear();
		},
	};
};
