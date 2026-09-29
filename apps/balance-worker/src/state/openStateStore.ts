import { createStateStore } from "./createStateStore.js";
import { openBalanceStateDatabase } from "./openBalanceStateDatabase.js";
import type { SqliteStateStore } from "./types/stateStore.js";

export const openStateStore = ({
	databasePath,
}: {
	databasePath: string;
}): SqliteStateStore =>
	createStateStore({ sqliteDb: openBalanceStateDatabase({ databasePath }) });
