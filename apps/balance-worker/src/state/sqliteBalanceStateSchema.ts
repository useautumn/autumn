import { Database } from "bun:sqlite";
import { UnsupportedBalanceStateSchemaVersionError } from "./sqliteBalanceStateErrors.js";

const SQLITE_SCHEMA_VERSION = 1;

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
			CREATE TABLE IF NOT EXISTS customer_states (
				partition_key TEXT PRIMARY KEY,
				topic TEXT NOT NULL,
				partition_id INTEGER NOT NULL CHECK (partition_id >= 0),
				initialization_id TEXT NOT NULL,
				initialization_fingerprint TEXT NOT NULL,
				revision INTEGER NOT NULL CHECK (revision >= 0),
				state_json TEXT NOT NULL,
				UNIQUE (partition_key, topic, partition_id),
				FOREIGN KEY (topic, partition_id)
					REFERENCES partition_progress(topic, partition_id)
					ON DELETE CASCADE
			)
		`);
		database.run(`
			CREATE TABLE IF NOT EXISTS track_receipts (
				partition_key TEXT NOT NULL,
				command_id TEXT NOT NULL,
				topic TEXT NOT NULL,
				partition_id INTEGER NOT NULL CHECK (partition_id >= 0),
				record_offset INTEGER NOT NULL CHECK (record_offset >= 0),
				deduplication_expires_at INTEGER NOT NULL
					CHECK (deduplication_expires_at >= 0),
				outcome_json TEXT NOT NULL,
				PRIMARY KEY (partition_key, command_id),
				FOREIGN KEY (partition_key, topic, partition_id)
					REFERENCES customer_states(partition_key, topic, partition_id)
					ON DELETE CASCADE
			)
		`);
		database.run(`
			CREATE INDEX IF NOT EXISTS customer_states_by_partition
			ON customer_states (topic, partition_id)
		`);
		database.run(`
			CREATE INDEX IF NOT EXISTS track_receipts_by_partition_expiry
			ON track_receipts (topic, partition_id, deduplication_expires_at)
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
