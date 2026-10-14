import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AutumnLogger } from "@autumn/logging";
import { newSqliteConnection } from "./newSqliteConnection.js";

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
