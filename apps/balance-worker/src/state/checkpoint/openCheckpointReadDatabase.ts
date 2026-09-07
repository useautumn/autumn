import { Database } from "bun:sqlite";
import { SQLITE_SCHEMA_VERSION } from "../sqliteBalanceStateSchema.js";

export const openCheckpointReadDatabase = ({
	databasePath,
}: {
	databasePath: string;
}): Database => {
	if (!databasePath || databasePath === ":memory:")
		throw new Error(
			"Background checkpoints require a file-backed SQLite database",
		);
	const database = new Database(databasePath, {
		readonly: true,
		strict: true,
		safeIntegers: true,
	});
	try {
		const version = database
			.query<{ version: bigint }, []>(
				"SELECT user_version AS version FROM pragma_user_version",
			)
			.get()?.version;
		const mode = database
			.query<{ mode: string }, []>(
				"SELECT journal_mode AS mode FROM pragma_journal_mode",
			)
			.get()?.mode;
		if (version !== BigInt(SQLITE_SCHEMA_VERSION))
			throw new Error(
				`Checkpoint reader requires SQLite schema ${SQLITE_SCHEMA_VERSION}, got ${version}`,
			);
		if (mode !== "wal")
			throw new Error("Background checkpoints require SQLite WAL mode");
		database.run("PRAGMA query_only = ON");
		database.run("PRAGMA busy_timeout = 1000");
		return database;
	} catch (cause) {
		database.close();
		throw cause;
	}
};
