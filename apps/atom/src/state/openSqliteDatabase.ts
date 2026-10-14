import type { Database } from "bun:sqlite";
import { SQLITE_PAGE_CACHE_BYTES } from "@autumn/env/atom";
import { newSqliteConnection } from "./newSqliteConnection.js";

const BUSY_TIMEOUT_MS = 5000;
export const JOURNAL_SIZE_LIMIT_BYTES = 1024 * 1024;

const WAL_SWITCH_ATTEMPTS = 50;
const WAL_SWITCH_RETRY_MS = 10;

const isBusy = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "SQLITE_BUSY";

const switchToWal = ({ database }: { database: Database }) => {
	for (let attempt = 1; ; attempt++) {
		try {
			database.run("PRAGMA journal_mode = WAL");
			return;
		} catch (error) {
			if (!isBusy(error) || attempt >= WAL_SWITCH_ATTEMPTS) throw error;
			Bun.sleepSync(WAL_SWITCH_RETRY_MS);
		}
	}
};

const configureDatabase = ({ database }: { database: Database }) => {
	database.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
	database.run("PRAGMA auto_vacuum = INCREMENTAL");
	switchToWal({ database });
	database.run("PRAGMA synchronous = NORMAL");
	database.run("PRAGMA wal_autocheckpoint = 0");
	database.run(`PRAGMA journal_size_limit = ${JOURNAL_SIZE_LIMIT_BYTES}`);
	database.run(`PRAGMA cache_size = -${SQLITE_PAGE_CACHE_BYTES / 1024}`);
};

const readSchemaVersion = ({ database }: { database: Database }) =>
	database
		.query<{ userVersion: bigint }, []>(
			"SELECT user_version AS userVersion FROM pragma_user_version",
		)
		.get()?.userVersion ?? null;

const initializeSchema = ({
	database,
	schemaVersion,
	dropSchema,
	createSchema,
}: {
	database: Database;
	schemaVersion: number;
	dropSchema: (params: { database: Database }) => void;
	createSchema: (params: { database: Database }) => void;
}) => {
	const migrate = database.transaction(() => {
		const version = readSchemaVersion({ database });
		if (version === null)
			throw new Error("Unable to read SQLite schema version");
		if (version === BigInt(schemaVersion)) return false;
		dropSchema({ database });
		createSchema({ database });
		database.run(`PRAGMA user_version = ${schemaVersion}`);
		return true;
	});

	const emptied = migrate.exclusive();
	if (emptied) database.run("VACUUM");
};

export const openSqliteDatabase = ({
	databasePath,
	schemaVersion,
	dropSchema,
	createSchema,
}: {
	databasePath: string;
	schemaVersion: number;
	dropSchema: (params: { database: Database }) => void;
	createSchema: (params: { database: Database }) => void;
}): Database => {
	const database = newSqliteConnection({
		path: databasePath,
		options: {
			create: true,
			readwrite: true,
			safeIntegers: true,
			strict: true,
		},
	});
	try {
		configureDatabase({ database });
		initializeSchema({ database, schemaVersion, dropSchema, createSchema });
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
};
