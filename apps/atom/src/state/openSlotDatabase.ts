import type { Database } from "bun:sqlite";
import { openSqliteDatabase } from "./openSqliteDatabase.js";

const SLOT_SCHEMA_VERSION = 7;

const dropSlotSchema = ({ database }: { database: Database }) => {
	database.run("DROP TABLE IF EXISTS subject_states");
	database.run("DROP TABLE IF EXISTS subject_slices");
	database.run("DROP TABLE IF EXISTS shared_texts");
};

const createSlotSchema = ({ database }: { database: Database }) => {
	database.run(`
		CREATE TABLE IF NOT EXISTS subject_states (
			customer_id TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			log_offset INTEGER NOT NULL CHECK (log_offset >= 0),
			read_at INTEGER NOT NULL,
			applied_at INTEGER NOT NULL,
			state_json TEXT NOT NULL,
			slice_hash TEXT NOT NULL,
			-- On the customer's own row: the log offset of its latest evict. It only rises, even past rows older than held.
			customer_version INTEGER NOT NULL DEFAULT 0 CHECK (customer_version >= 0),
			PRIMARY KEY (customer_id, entity_id)
		) WITHOUT ROWID
	`);
	database.run(
		"CREATE INDEX IF NOT EXISTS subject_states_applied_at ON subject_states (applied_at)",
	);
	database.run(`
		CREATE TABLE IF NOT EXISTS subject_slices (
			customer_id TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			slice_hash TEXT NOT NULL,
			catalog_json TEXT NOT NULL,
			org_json TEXT NOT NULL,
			PRIMARY KEY (customer_id, entity_id)
		) WITHOUT ROWID
	`);
};

export const openSlotDatabase = ({
	databasePath,
}: {
	databasePath: string;
}): Database =>
	openSqliteDatabase({
		databasePath,
		schemaVersion: SLOT_SCHEMA_VERSION,
		dropSchema: dropSlotSchema,
		createSchema: createSlotSchema,
	});
