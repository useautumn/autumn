import type { Database } from "bun:sqlite";
import type { SqliteWriteOp } from "../sqliteWrites.js";

/** One slot or journal file as its serving thread holds it: a connection it reads on, and the writes it hands off. */
export type SqliteFile = {
	sqliteDb: Database;
	/** Resolves with the statement's answer once its transaction has committed; rejects if it failed. */
	write(op: SqliteWriteOp, payload: string): Promise<string>;
	close(params?: { throwOnError?: boolean }): void;
};
