import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AutumnLogger } from "@autumn/logging";
import { newSqliteConnection } from "./newSqliteConnection.js";

/** What SQLite says of a file that is not, or no longer, a database it can read: it never will be. */
const UNREADABLE_FILE_CODES = new Set(["SQLITE_NOTADB", "SQLITE_CORRUPT"]);

const isUnreadableFile = (error: unknown): boolean =>
	error instanceof Error &&
	"code" in error &&
	UNREADABLE_FILE_CODES.has(String(error.code));

const listSqliteFiles = ({ dataDir }: { dataDir: string }): string[] => {
	try {
		return readdirSync(dataDir, { recursive: true, encoding: "utf8" })
			.filter((name) => name.endsWith(".sqlite"))
			.map((name) => join(dataDir, name));
	} catch {
		return [];
	}
};

/** Reads what a thread's open reads first: the header, and the schema it checks its tables against. */
const readSchema = ({ path }: { path: string }): void => {
	const database = newSqliteConnection({
		path,
		options: { readwrite: true, create: false },
	});
	try {
		database.query("SELECT count(*) FROM sqlite_master").get();
	} finally {
		database.close();
	}
};

/**
 * Before any thread opens a file: one SQLite cannot read would fail its thread's start on every boot. The files copy
 * what Autumn holds, so it is removed, and the thread opens it afresh for catch-up and pulls to fill.
 */
export const removeUnreadableFiles = ({
	dataDir,
	logger,
}: {
	dataDir: string;
	logger: Pick<AutumnLogger, "error">;
}): void => {
	for (const path of listSqliteFiles({ dataDir })) {
		try {
			readSchema({ path });
		} catch (error) {
			if (!isUnreadableFile(error)) continue;
			for (const suffix of ["", "-wal", "-shm"])
				rmSync(`${path}${suffix}`, { force: true });
			logger.error(
				{ type: "atom_file_unreadable", error, data: { path } },
				`${path} could not be read; it was removed, and is filled again from the peers and Autumn`,
			);
		}
	}
};
