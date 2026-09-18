import { createStateStore } from "./createStateStore.js";
import { openBalanceStateDatabase } from "./openBalanceStateDatabase.js";
import { STATE_BACKEND } from "./stateBackend.js";
import type { SqliteStateStore } from "./types/stateStore.js";

export const openStateStore = ({
	databasePath,
}: {
	databasePath: string;
}): SqliteStateStore => {
	if (STATE_BACKEND !== "sqlite") {
		throw new Error(`State backend not wired: ${STATE_BACKEND}`);
	}
	return createStateStore({
		sqliteDb: openBalanceStateDatabase({ databasePath }),
	});
};
