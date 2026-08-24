import type { Journal } from "../../internal/journal/types/journal.js";
import type { JournalContext } from "../../internal/journal/types/journalContext.js";
import { LedgerNotImplementedError } from "../../lib/ledgerNotImplementedError.js";

// The idempotent kafkajs producer against the `subject-events` topic.
export const createRedpandaJournal = (_params: {
	ctx: JournalContext;
}): Journal => {
	throw new LedgerNotImplementedError("redpanda journal");
};
