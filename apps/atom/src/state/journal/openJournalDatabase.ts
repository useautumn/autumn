import type { Database } from "bun:sqlite";
import { openSqliteDatabase } from "../openSqliteDatabase.js";

/** A file of another version is emptied on open, and with it what was owed: bump only with a migration of the rows. */
const JOURNAL_SCHEMA_VERSION = 1;

const dropJournalSchema = ({ database }: { database: Database }) => {
	database.run("DROP TABLE IF EXISTS journal_entries");
	database.run("DROP TABLE IF EXISTS journal_seqs");
};

const createJournalSchema = ({ database }: { database: Database }) => {
	database.run(`
		CREATE TABLE IF NOT EXISTS journal_entries (
			customer_id TEXT NOT NULL,
			seq INTEGER NOT NULL CHECK (seq > 0),
			status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'rejected')),
			reject_code TEXT CHECK ((status = 'rejected') = (reject_code IS NOT NULL)),
			command_json TEXT NOT NULL,
			PRIMARY KEY (customer_id, seq)
		) WITHOUT ROWID
	`);
	// The highest seq each customer was given, kept past its entries so a dropped seq is never handed out again.
	database.run(`
		CREATE TABLE IF NOT EXISTS journal_seqs (
			customer_id TEXT PRIMARY KEY,
			last_seq INTEGER NOT NULL CHECK (last_seq > 0)
		) WITHOUT ROWID
	`);
};

/** A slot's journal: the deductions the Atom granted and has not yet seen Autumn apply, kept as lightly as the slot's subjects. */
export const openJournalDatabase = ({
	databasePath,
}: {
	databasePath: string;
}): Database =>
	openSqliteDatabase({
		databasePath,
		schemaVersion: JOURNAL_SCHEMA_VERSION,
		dropSchema: dropJournalSchema,
		createSchema: createJournalSchema,
	});
