import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import type { Slots } from "./types/slots.js";

/** One slot file holds every customer until slots are split. */
const SLOT_FILE = "slot-000.sqlite";

/** Opens a data folder once: its slot file stays open, and its processor answers from it. */
export const openSlots = ({ folder }: { folder: string }): Slots => {
	mkdirSync(folder, { recursive: true });
	const sqliteStore = openSqliteStore({
		databasePath: join(folder, SLOT_FILE),
	});
	const processor = createSlotProcessor({ ctx: { sqliteStore } });
	return {
		processorFor: () => processor,
		close: () => sqliteStore.close(),
	};
};
