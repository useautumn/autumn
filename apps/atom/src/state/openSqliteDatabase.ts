import { Database } from "bun:sqlite";
import { ATOM_WAL_CHECKPOINTED_ELSEWHERE } from "./startWalCheckpointer.js";

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

/** Several processes share each file. A writer waits this long for another's write before giving up. */
const BUSY_TIMEOUT_MS = 5000;
/** Address space, not memory: a file larger than this reads the rest through ordinary reads. */
const MMAP_BYTES = 256 * 1024 * 1024;

const configureDatabase = ({ database }: { database: Database }) => {
	// First, before anything touches the file: another process may be recovering its log right now.
	database.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
	database.run("PRAGMA journal_mode = WAL");
	// Autumn holds the truth and can send everything again, so a commit does not wait on the disk.
	database.run("PRAGMA synchronous = NORMAL");
	// Pages come straight from the OS cache: another process's write empties this connection's own page cache.
	database.run(`PRAGMA mmap_size = ${MMAP_BYTES}`);
	if (process.env[ATOM_WAL_CHECKPOINTED_ELSEWHERE] === "1")
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
	if (version > BigInt(schemaVersion)) {
		throw new UnsupportedSchemaVersionError({ databasePath, version });
	}

	const migrate = database.transaction(() => {
		// An older file is a copy of what Autumn holds: it is emptied and sent again, never migrated.
		if (version < BigInt(schemaVersion)) dropSchema({ database });
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
