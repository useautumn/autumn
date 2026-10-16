import { openSqliteReader } from "../openSqliteDatabase.js";
import { getSqliteWriter } from "./getSqliteWriter.js";
import {
	SQLITE_FILE_OPENERS,
	SQLITE_WRITES,
	type SqliteFileKind,
} from "./sqliteWrites.js";
import type { SqliteFile } from "./types/sqliteFile.js";

/** A file held in memory has no second connection to share it, so its writes run on the thread that reads it. */
const openInline = ({
	databasePath,
	kind,
}: {
	databasePath: string;
	kind: SqliteFileKind;
}): SqliteFile => {
	const sqliteDb = SQLITE_FILE_OPENERS[kind]({ databasePath });
	return {
		sqliteDb,
		write: (op, payload) => {
			try {
				return Promise.resolve(
					SQLITE_WRITES[op]({ ctx: { sqliteDb }, payload }),
				);
			} catch (error) {
				return Promise.reject(error);
			}
		},
		close: (params) => sqliteDb.close(params?.throwOnError),
	};
};

/** Opens a slot or journal file: its writes commit on this thread's writer thread, its reads run here. */
export const openWrittenFile = ({
	databasePath,
	kind,
}: {
	databasePath: string;
	kind: SqliteFileKind;
}): SqliteFile => {
	if (databasePath === ":memory:") return openInline({ databasePath, kind });
	const writer = getSqliteWriter();
	const fileId = writer.open({ path: databasePath, kind });
	let sqliteDb: ReturnType<typeof openSqliteReader>;
	try {
		sqliteDb = openSqliteReader({ databasePath });
	} catch (error) {
		writer.close({ fileId });
		throw error;
	}
	return {
		sqliteDb,
		write: (op, payload) => writer.write({ fileId, op, payload }),
		// The reader goes first, so the writer's close is the file's last and checkpoints off this thread.
		close: (params) => {
			sqliteDb.close(params?.throwOnError);
			writer.close({ fileId });
		},
	};
};
