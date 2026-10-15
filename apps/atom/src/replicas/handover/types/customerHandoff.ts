import type { HandedEntry } from "../../../state/journal/types/journal.js";
import type { OpenLock } from "../../../state/openLocks/createOpenLocks.js";

/** What one replica holds for a customer another one owns now: the owed entries of its journal and the locks it took. */
export type CustomerHandoff = {
	customerId: string;
	entries: HandedEntry[];
	locks: OpenLock[];
};
