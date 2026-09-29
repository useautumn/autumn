import type { Database } from "bun:sqlite";

export type StateStoreContext = {
	sqliteDb: Database;
};
