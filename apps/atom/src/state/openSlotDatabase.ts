import type { Database } from "bun:sqlite";
import { openSqliteDatabase } from "./openSqliteDatabase.js";

const SLOT_SCHEMA_VERSION = 5;

const dropSlotSchema = ({ database }: { database: Database }) => {
	database.run("DROP TABLE IF EXISTS subject_states");
	database.run("DROP TABLE IF EXISTS subject_slices");
	database.run("DROP TABLE IF EXISTS shared_texts");
};

const createSlotSchema = ({ database }: { database: Database }) => {
	// entity_id is '' for the customer's own rows, so the pair is always a full key. Each subject has its own catalog
	// slice and org, beside its state under the same key, so a push that leaves the slice unchanged rewrites only the state.
	database.run(`
		CREATE TABLE IF NOT EXISTS subject_states (
			customer_id TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			log_offset INTEGER NOT NULL CHECK (log_offset >= 0),
			read_at INTEGER NOT NULL,
			state_json TEXT NOT NULL,
			slice_hash TEXT NOT NULL,
			PRIMARY KEY (customer_id, entity_id)
		) WITHOUT ROWID
	`);
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

/** A slot is one SQLite file holding the subjects whose customer hashes to it. */
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
