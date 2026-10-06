import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const TICK_MS = 1000;
/**
 * Each file is checkpointed once per this many ticks, a slice of the files each tick. A completed checkpoint makes the
 * next write restart the log, and that restart syncs the log header on the writing (serving) thread.
 */
export const TICKS_PER_FILE = 30;
const WAL_SUFFIX = "-wal";

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
	logger: { warn(fields: object, message: string): void };
}): { checkpoint(): void; stop(): void } => {
	const open = new Map<string, Database>();
	const failing = new Set<string>();

	function checkpointOne({ path }: { path: string }): void {
		try {
			let database = open.get(path);
			if (!database) {
				database = new Database(path, { readwrite: true, create: false });
				open.set(path, database);
			}
			// Passive never waits on a reader or writer: what it cannot copy now it copies next time.
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

	function checkpoint(): void {
		const paths = listWalDatabases({ dataDir }).sort();
		const listed = new Set(paths);
		for (const [path, database] of open)
			if (!listed.has(path)) {
				database.close();
				open.delete(path);
			}
		paths.forEach((path, index) => {
			if (index % TICKS_PER_FILE === tick % TICKS_PER_FILE)
				checkpointOne({ path });
		});
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
