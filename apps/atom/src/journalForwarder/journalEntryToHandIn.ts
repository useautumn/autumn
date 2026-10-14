import type { AtomTracksAppendRequest } from "@autumn/byoc";
import type { JournalEntry } from "../state/journal/types/journal.js";
import { overrideOverageForHandIn } from "./overrideOverageForHandIn.js";

/**
 * A journaled entry as Autumn takes it: a track as the worker's own command, a finalize as the lock it names. Autumn
 * settles its own row, so the row the Atom journaled for its replay never leaves it.
 */
export const journalEntryToHandIn = ({
	writerId,
	entry: { seq, command },
}: {
	writerId: string;
	entry: JournalEntry;
}): AtomTracksAppendRequest["tracks"][number] => {
	if (command.type === "track")
		return { writerId, seq, command: overrideOverageForHandIn({ command }) };
	return {
		writerId,
		seq,
		finalize: {
			requestId: command.requestId,
			occurredAt: command.occurredAt,
			customer_id: command.identity.customerId,
			lock_id: command.lock.lock_id,
			entity_id: command.lock.entity_id,
			feature_id: command.lock.feature_id,
			finalValue: command.finalValue,
			properties: command.properties,
		},
	};
};
