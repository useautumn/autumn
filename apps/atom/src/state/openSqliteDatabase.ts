import { Database } from "bun:sqlite";

export class UnsupportedSchemaVersionError extends Error {
	constructor({
		databasePath,
		version,
	}: { databasePath: string; version: bigint }) {
		super(
			`${databasePath} has schema version ${version}, newer than this Atom supports`,
		);
		this.name = "UnsupportedSchemaVersionError";
	}
}

/** A file's owner thread writes it while the main thread checkpoints it. A writer waits this long before giving up. */
const BUSY_TIMEOUT_MS = 5000;
/** Address space, not memory: a file larger than this reads the rest through ordinary reads. */
const MMAP_BYTES = 256 * 1024 * 1024;

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
	// First, before anything touches the file: another connection may be recovering its log right now.
	database.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
	switchToWal({ database });
	// Autumn holds the truth and can send everything again, so a commit does not wait on the disk.
	database.run("PRAGMA synchronous = NORMAL");
	// Pages come straight from the OS cache, not a copy in each connection's own page cache.
	database.run(`PRAGMA mmap_size = ${MMAP_BYTES}`);
	// The main thread checkpoints every file (startWalCheckpointer), so a commit never copies the log back itself.
	database.run("PRAGMA wal_autocheckpoint = 0");
};

const initializeSchema = ({
	database,
	databasePath,
	schemaVersion,
	dropSchema,
	createSchema,
}: {
	database: Database;
	databasePath: string;
	schemaVersion: number;
	dropSchema: (params: { database: Database }) => void;
	createSchema: (params: { database: Database }) => void;
}) => {
	const version = database
		.query<{ userVersion: bigint }, []>(
			"SELECT user_version AS userVersion FROM pragma_user_version",
		)
		.get()?.userVersion;

	if (version === undefined) {
		throw new Error("Unable to read SQLite schema version");
	}
	const migrate = database.transaction(() => {
		// Any other version is a copy of what Autumn holds: it is emptied and sent again, never migrated.
		if (version !== BigInt(schemaVersion)) dropSchema({ database });
		createSchema({ database });
		database.run(`PRAGMA user_version = ${schemaVersion}`);
	});

	migrate.exclusive();
};

/** Opens one of Atom's SQLite files with its schema in place; a file from a newer Atom is refused. */
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
	const database = new Database(databasePath, {
		create: true,
		readwrite: true,
		safeIntegers: true,
		strict: true,
	});

	try {
		configureDatabase({ database });
		initializeSchema({
			database,
			databasePath,
			schemaVersion,
			dropSchema,
			createSchema,
		});
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
};
