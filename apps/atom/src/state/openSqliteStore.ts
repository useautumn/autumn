import { openSlotDatabase } from "./openSlotDatabase.js";
import { readSubject, upsertSubject } from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";

export const openSqliteStore = ({
	databasePath,
}: {
	databasePath: string;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };

	return {
		readSubject: (params) => readSubject({ ctx, ...params }),
		setSubject: (params) => upsertSubject({ ctx, ...params }),
		close: () => ctx.sqliteDb.close(true),
	};
};
