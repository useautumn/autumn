import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Set by the supervisor on every child: it checkpoints their files, so a push never copies the log back itself. */
export const ATOM_WAL_CHECKPOINTED_ELSEWHERE =
	"ATOM_WAL_CHECKPOINTED_ELSEWHERE";

const CHECKPOINT_EVERY_MS = 1000;
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
 * Copies every SQLite log in the data folder back into its file once a second, from the supervisor.
 * A checkpoint writes and syncs megabytes; done by a serving process, it stalls every request queued behind that push.
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

	function checkpoint(): void {
		const paths = new Set(listWalDatabases({ dataDir }));
		for (const [path, database] of open)
			if (!paths.has(path)) {
				database.close();
				open.delete(path);
			}
		for (const path of paths) checkpointOne({ path });
	}

	const timer = setInterval(checkpoint, CHECKPOINT_EVERY_MS);
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
