import type { Database } from "bun:sqlite";
import { SQLITE_PAGE_CACHE_BYTES } from "@autumn/env/atom";
import { newSqliteConnection } from "./newSqliteConnection.js";

/** Every thread shares each file. A writer waits this long for another's write before giving up. */
const BUSY_TIMEOUT_MS = 5000;
/** A completed checkpoint cuts the log back to this, so 128 logs never sit at their high-water mark. */
export const JOURNAL_SIZE_LIMIT_BYTES = 1024 * 1024;

/** Threads opening a new file together each try to switch it to WAL; this many tries, this far apart, outlast the others. */
const WAL_SWITCH_ATTEMPTS = 50;
const WAL_SWITCH_RETRY_MS = 10;

const isBusy = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "SQLITE_BUSY";

/** Switching to WAL takes a lock the busy timeout does not wait for, so a busy switch is tried again. */
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
	// First, before anything touches the file: another thread may be recovering its log right now.
	database.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
	// Pages a dropped customer frees can be handed back to the volume. Before the WAL switch writes the header; a file
	// that already has one keeps its mode until the VACUUM that follows an emptied schema.
	database.run("PRAGMA auto_vacuum = INCREMENTAL");
	switchToWal({ database });
	// Autumn holds the truth and can send everything again, so a commit does not wait on the disk.
	database.run("PRAGMA synchronous = NORMAL");
	// The main thread checkpoints every file (startWalCheckpointer), so a commit never copies the log back itself.
	database.run("PRAGMA wal_autocheckpoint = 0");
	database.run(`PRAGMA journal_size_limit = ${JOURNAL_SIZE_LIMIT_BYTES}`);
	// Bounded per connection, since a thread opens one per slot; reads still hit the kernel's page cache.
	database.run(`PRAGMA cache_size = -${SQLITE_PAGE_CACHE_BYTES / 1024}`);
};

/** Null when the file's version cannot be read. */
const readSchemaVersion = ({ database }: { database: Database }) =>
	database
		.query<{ userVersion: bigint }, []>(
			"SELECT user_version AS userVersion FROM pragma_user_version",
		)
		.get()?.userVersion ?? null;

/**
 * The version is read inside the exclusive transaction: threads opening a new file together would otherwise all read
 * it as empty, and each drop the tables the first one created.
 */
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
		// Any other version is a copy of what Autumn holds: it is emptied and sent again, never migrated, so a rollback keeps accepting pushes.
		dropSchema({ database });
		createSchema({ database });
		database.run(`PRAGMA user_version = ${schemaVersion}`);
		return true;
	});

	const emptied = migrate.exclusive();
	// Emptied, the file is rebuilt so the auto_vacuum mode set above takes.
	if (emptied) database.run("VACUUM");
};

/** Opens one of Atom's SQLite files with its schema in place; a file of any other version is emptied. */
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

/** A serving thread's connection to a file its writer thread opened: it reads, and SQLite refuses it any write. */
export const openSqliteReader = ({
	databasePath,
}: {
	databasePath: string;
}): Database => {
	const database = newSqliteConnection({
		path: databasePath,
		options: { readonly: true, safeIntegers: true, strict: true },
	});
	try {
		database.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
		database.run(`PRAGMA cache_size = -${SQLITE_PAGE_CACHE_BYTES / 1024}`);
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
};
