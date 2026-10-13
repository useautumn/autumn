import type { TrackCommand } from "@autumn/balance-engine";
import { deepFreeze } from "../deepFreeze.js";
import {
	deleteJournalEntries,
	insertJournalEntries,
	readLastJournalSeqs,
	readOwedJournalEntries,
	updateJournalStatus,
} from "../repos/journalEntries.js";
import type { StoredSubject } from "../types/storedSubject.js";
import { commandsSeenBy } from "./commandsSeenBy.js";
import { createGroupCommit } from "./createGroupCommit.js";
import { openJournalDatabase } from "./openJournalDatabase.js";
import type { Journal, JournalEntry, JournalStatus } from "./types/journal.js";

/** Every customer with nothing owed shares it, so a view memoised on it stays valid. */
const NOTHING_OWED: readonly JournalEntry[] = Object.freeze([]);

const PENDING: JournalStatus = { kind: "pending" };

/**
 * One slot's journal, opened by the slot's owner thread only, so what it holds in memory is the file plus the appends
 * whose commit is still in flight. Those count as owed from the moment they are appended: the next check decides on them.
 */
export const openJournal = ({
	databasePath,
	seenBy = commandsSeenBy,
}: {
	databasePath: string;
	seenBy?: typeof commandsSeenBy;
}): Journal => {
	const ctx = { sqliteDb: openJournalDatabase({ databasePath }) };
	const groupCommit = createGroupCommit({
		commit: (entries: JournalEntry[]) => insertJournalEntries({ ctx, entries }),
	});
	const lastSeqs = readLastJournalSeqs({ ctx });
	const owedByCustomer = new Map<string, readonly JournalEntry[]>();
	for (const entry of readOwedJournalEntries({ ctx }))
		owedByCustomer.set(entry.customerId, [
			...owed({ customerId: entry.customerId }),
			deepFreeze(entry),
		]);

	function owed({ customerId }: { customerId: string }) {
		return owedByCustomer.get(customerId) ?? NOTHING_OWED;
	}

	function setOwed({
		customerId,
		entries,
	}: {
		customerId: string;
		entries: readonly JournalEntry[];
	}): void {
		if (entries.length === 0) owedByCustomer.delete(customerId);
		else owedByCustomer.set(customerId, entries);
	}

	/** The seq is taken on this thread in arrival order and written in the entry's own commit; a failed commit leaves a gap. */
	async function append({
		customerId,
		command,
	}: {
		customerId: string;
		command: TrackCommand;
	}): Promise<JournalEntry> {
		const seq = (lastSeqs.get(customerId) ?? 0) + 1;
		lastSeqs.set(customerId, seq);
		const entry = deepFreeze({ customerId, seq, status: PENDING, command });
		setOwed({ customerId, entries: [...owed({ customerId }), entry] });
		try {
			await groupCommit.add(entry);
			return entry;
		} catch (error) {
			setOwed({
				customerId,
				entries: owed({ customerId }).filter((held) => held !== entry),
			});
			throw error;
		}
	}

	function setStatus({
		customerId,
		seq,
		status,
	}: {
		customerId: string;
		seq: number;
		status: JournalStatus;
	}): void {
		updateJournalStatus({ ctx, customerId, seq, status });
		const entries = owed({ customerId }).flatMap((entry) => {
			if (entry.seq !== seq) return [entry];
			return status.kind === "rejected"
				? []
				: [deepFreeze({ ...entry, status })];
		});
		setOwed({ customerId, entries });
	}

	function reconcile({
		customerId,
		subject,
	}: {
		customerId: string;
		subject: StoredSubject;
	}): void {
		const seen = new Set(seenBy({ owed: owed({ customerId }), subject }));
		if (seen.size === 0) return;
		deleteJournalEntries({ ctx, customerId, seqs: [...seen] });
		setOwed({
			customerId,
			entries: owed({ customerId }).filter(({ seq }) => !seen.has(seq)),
		});
	}

	return {
		append,
		owed,
		setStatus,
		reconcile,
		close: () => ctx.sqliteDb.close(),
	};
};
