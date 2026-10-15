import type { Database } from "bun:sqlite";
import { openJournalDatabase } from "../journal/openJournalDatabase.js";
import { openSlotDatabase } from "../openSlotDatabase.js";
import {
	deleteCustomerJournalEntries,
	deleteJournalEntriesUpTo,
	insertJournalEntries,
} from "../repos/journalEntries.js";
import {
	deleteCustomersWrittenBefore,
	upsertSubjects,
} from "../repos/subjectStates.js";

/** Every statement that writes a slot or journal file: each takes the serialized batch and answers with a string. */
export const SQLITE_WRITES = {
	insertJournalEntries,
	deleteJournalEntriesUpTo,
	deleteCustomerJournalEntries,
	upsertSubjects,
	deleteCustomersWrittenBefore,
} satisfies Record<
	string,
	(params: { ctx: { sqliteDb: Database }; payload: string }) => string
>;

export type SqliteWriteOp = keyof typeof SQLITE_WRITES;

/** Opening a file writes it too: its pragmas, its schema and user_version, and the VACUUM after an emptied schema. */
export const SQLITE_FILE_OPENERS = {
	slot: openSlotDatabase,
	journal: openJournalDatabase,
} satisfies Record<string, (params: { databasePath: string }) => Database>;

export type SqliteFileKind = keyof typeof SQLITE_FILE_OPENERS;
