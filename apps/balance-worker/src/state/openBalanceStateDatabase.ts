import { Database } from "bun:sqlite";
import { UnsupportedBalanceStateSchemaVersionError } from "./stateStoreErrors.js";

export const SQLITE_SCHEMA_VERSION = 1;

const configureDatabase = ({ database }: { database: Database }) => {
	database.run("PRAGMA foreign_keys = ON");
	database.run("PRAGMA journal_mode = WAL");
	database.run("PRAGMA synchronous = FULL");
};

const initializeSchema = ({ database }: { database: Database }) => {
	const version = database
		.query<{ userVersion: bigint }, []>(
			"SELECT user_version AS userVersion FROM pragma_user_version",
		)
		.get()?.userVersion;

	if (version === undefined) {
		throw new Error("Unable to read SQLite schema version");
	}
	if (version > BigInt(SQLITE_SCHEMA_VERSION)) {
		throw new UnsupportedBalanceStateSchemaVersionError({ version });
	}

	const migrate = database.transaction(() => {
		database.run(`
			CREATE TABLE IF NOT EXISTS partition_progress (
				topic TEXT NOT NULL,
				partition_id INTEGER NOT NULL CHECK (partition_id >= 0),
				next_offset INTEGER NOT NULL CHECK (next_offset >= 0),
				PRIMARY KEY (topic, partition_id)
			)
		`);
		database.run(`
			CREATE TABLE IF NOT EXISTS subject_states (
				subject_key TEXT PRIMARY KEY,
				partition_key TEXT NOT NULL,
				topic TEXT NOT NULL,
				partition_id INTEGER NOT NULL CHECK (partition_id >= 0),
				revision INTEGER NOT NULL CHECK (revision >= 0),
				state_json TEXT NOT NULL,
				UNIQUE (subject_key, topic, partition_id),
				FOREIGN KEY (topic, partition_id)
					REFERENCES partition_progress(topic, partition_id)
					ON DELETE CASCADE
			)
		`);
		database.run(`
			CREATE TABLE IF NOT EXISTS mutation_receipts (
				partition_key TEXT NOT NULL,
				mutation_id TEXT NOT NULL,
				topic TEXT NOT NULL,
				partition_id INTEGER NOT NULL CHECK (partition_id >= 0),
				record_offset INTEGER NOT NULL CHECK (record_offset >= 0),
				fingerprint TEXT NOT NULL,
				expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
				mutation_json TEXT NOT NULL,
				PRIMARY KEY (partition_key, mutation_id),
				FOREIGN KEY (partition_key, topic, partition_id)
					REFERENCES subject_states(subject_key, topic, partition_id)
					ON DELETE CASCADE
			)
		`);
		database.run(`
			CREATE INDEX IF NOT EXISTS subject_states_by_partition
			ON subject_states (topic, partition_id)
		`);
		database.run(`
			CREATE INDEX IF NOT EXISTS subject_states_by_customer
			ON subject_states (partition_key)
		`);
		database.run(`
			CREATE INDEX IF NOT EXISTS mutation_receipts_by_partition_expiry
			ON mutation_receipts (topic, partition_id, expires_at)
		`);
		database.run(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION}`);
	});

	migrate.exclusive();
};

export const openBalanceStateDatabase = ({
	databasePath,
}: {
	databasePath: string;
}): Database => {
	const database = new Database(databasePath, {
		create: true,
		readwrite: true,
		safeIntegers: true,
		strict: true,
	});

	try {
		configureDatabase({ database });
		initializeSchema({ database });
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
};
