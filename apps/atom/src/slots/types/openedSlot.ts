import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";

export type OpenedSlot = {
	sqliteStore: SqliteStore | null;
	processor: SlotProcessor;
};
