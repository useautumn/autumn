import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { newSqliteConnection } from "./newSqliteConnection.js";
import { JOURNAL_SIZE_LIMIT_BYTES } from "./openSqliteDatabase.js";

const TICK_MS = 1000;
/**
 * Each file is checkpointed once per this many ticks, a slice of the files each tick. A completed checkpoint makes the
 * next write restart the log, and that restart syncs the log header on the writing (serving) thread.
 */
// BENCH ONLY (#369 pacing spike, never merge): 10, between 3 (the IOPS ceiling) and 30 (the throughput ceiling) on gp3 3000/125.
export const TICKS_PER_FILE = 10;
/** A log past this is copied on the next tick, ahead of its turn: one hot file's 30 s of writes came back as a 163 MB
 * burst that stalled the loop for a second (rig, 2026-10-14); 16 MB every few seconds does not. */
export const CHECKPOINT_WAL_BYTES = 16 * 1024 * 1024;
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
			// Passive never waits on a reader or writer: what it cannot copy now it copies next time.
			const [passive] = database
				.query<{ busy: number; log: number; checkpointed: number }, []>(
					"PRAGMA wal_checkpoint(PASSIVE)",
				)
				.all();
			// BENCH ONLY (#369 write amplification, never merge): frames in the log when copied, and how many were copied.
			if (passive) {
				const frames = (minute.frames.get(path) ?? 0) + Number(passive.log);
				minute.frames.set(path, frames);
				logger.info?.(
					{
						type: "atom_write_amp_checkpoint",
						data: {
							file: path.slice(dataDir.length + 1),
							logFrames: Number(passive.log),
							checkpointedFrames: Number(passive.checkpointed),
						},
					},
					"write amp checkpoint",
				);
			}
			// A log past its limit is cut by the next write; a file nobody writes to any more is cut here instead.
			if (statSync(`${path}${WAL_SUFFIX}`).size > JOURNAL_SIZE_LIMIT_BYTES)
				database.run("PRAGMA wal_checkpoint(TRUNCATE)");
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
	// BENCH ONLY (#369 write amplification, never merge): log frames per file this minute, and the process's disk writes.
	const minute = {
		frames: new Map<string, number>(),
		startedAt: performance.now(),
	};
	const processWriteBytes = () => {
		try {
			return Number(
				/write_bytes: (\d+)/.exec(readFileSync("/proc/self/io", "utf8"))?.[1] ??
					0,
			);
		} catch {
			return 0;
		}
	};
	let writeBytes = processWriteBytes();
	function readPageStats(): void {
		const journals = [...minute.frames].filter(([path]) =>
			basename(path).startsWith("journal"),
		);
		const [hot] = journals.sort((a, b) => b[1] - a[1]);
		minute.frames = new Map();
		if (!hot) return;
		const database = open.get(hot[0]);
		if (!database) return;
		const pages = database
			.query<
				{ name: string; pagetype: string; pages: number; fill: number },
				[]
			>(
				"SELECT name, pagetype, count(*) AS pages, round(sum(pgsize - unused) * 1.0 / sum(pgsize), 3) AS fill FROM dbstat GROUP BY name, pagetype",
			)
			.all();
		logger.info?.(
			{
				type: "atom_write_amp_pages",
				data: {
					file: hot[0].slice(dataDir.length + 1),
					logFramesThisMinute: hot[1],
					pages,
				},
			},
			"write amp pages",
		);
	}

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
			const size = walBytesOf({ path });
			const itsTurn = index % TICKS_PER_FILE === tick % TICKS_PER_FILE;
			if (!itsTurn && size <= CHECKPOINT_WAL_BYTES) return;
			const fileStartedAt = performance.now();
			walBytes += size;
			checkpointOne({ path });
			files++;
			maxMs = Math.max(maxMs, performance.now() - fileStartedAt);
		});
		const ms = performance.now() - startedAt;
		if (ms >= 20)
			logger.info?.(
				{
					type: "atom_rig_wal_checkpoint_tick",
					data: {
						tick,
						files,
						walBytes,
						ms: Math.round(ms),
						maxMs: Math.round(maxMs),
					},
				},
				"WAL checkpoint tick",
			);
		const nowBytes = processWriteBytes();
		logger.info?.(
			{
				type: "atom_write_amp_tick",
				data: { tick, processWriteBytes: nowBytes - writeBytes },
			},
			"write amp tick",
		);
		writeBytes = nowBytes;
		if (performance.now() - minute.startedAt >= 60_000) {
			minute.startedAt = performance.now();
			try {
				readPageStats();
			} catch (error) {
				logger.warn(
					{ type: "atom_write_amp_pages_failed", error },
					"write amp pages failed",
				);
			}
		}
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
