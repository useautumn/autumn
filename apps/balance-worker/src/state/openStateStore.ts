import { createStateStore } from "./createStateStore.js";
import { openBalanceStateDatabase } from "./openBalanceStateDatabase.js";
import type { StateStore } from "./types/stateStore.js";

export const openStateStore = ({
	databasePath,
}: {
	databasePath: string;
}): StateStore =>
	createStateStore({ sqliteDb: openBalanceStateDatabase({ databasePath }) });
