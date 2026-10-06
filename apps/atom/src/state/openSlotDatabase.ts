import type { Database } from "bun:sqlite";
import { openSqliteDatabase } from "./openSqliteDatabase.js";

const SLOT_SCHEMA_VERSION = 3;

const dropSlotSchema = ({ database }: { database: Database }) => {
	database.run("DROP TABLE IF EXISTS subject_states");
	database.run("DROP TABLE IF EXISTS shared_texts");
};

const createSlotSchema = ({ database }: { database: Database }) => {
	// entity_id is '' for the customer's own rows, so the pair is always a full key.
	database.run(`
		CREATE TABLE IF NOT EXISTS subject_states (
			customer_id TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			log_offset INTEGER NOT NULL CHECK (log_offset >= 0),
			read_at INTEGER NOT NULL,
			state_json TEXT NOT NULL,
			catalog_hash TEXT NOT NULL,
			org_hash TEXT NOT NULL,
			PRIMARY KEY (customer_id, entity_id)
		) WITHOUT ROWID
	`);
	// An org's customers mostly carry the same catalog and org: each distinct text is stored once, by its hash.
	database.run(`
		CREATE TABLE IF NOT EXISTS shared_texts (
			hash TEXT PRIMARY KEY,
			text TEXT NOT NULL
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
