import type {
	HandedEntry,
	JournalKeyRow,
} from "../../../state/journal/types/journal.js";
import type { OpenLock } from "../../../state/openLocks/createOpenLocks.js";

/** What one replica holds for a customer another one owns now: owed entries, open locks, and its last seconds of idempotency keys. */
export type CustomerHandoff = {
	customerId: string;
	entries: HandedEntry[];
	locks: OpenLock[];
	keys: JournalKeyRow[];
};
