import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import type { Journal } from "../../state/journal/types/journal.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";

/** A slot this thread owns answers from its own file; any other is answered on the thread that owns it. */
export type OpenedSlot = {
	sqliteStore: SqliteStore | null;
	journal: Journal | null;
	processor: SlotProcessor;
};
