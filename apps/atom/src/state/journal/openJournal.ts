import type { TrackCommand } from "@autumn/balance-engine";
import { deepFreeze } from "../deepFreeze.js";
import {
	deleteJournalEntriesUpTo,
	insertJournalEntries,
	readLastJournalSeqs,
	readOwedJournalEntries,
} from "../repos/journalEntries.js";
import { createGroupCommit } from "./createGroupCommit.js";
import { openJournalDatabase } from "./openJournalDatabase.js";
import type { Journal, JournalEntry } from "./types/journal.js";

/** Every customer with nothing owed shares it, so a view memoised on it stays valid. */
const NOTHING_OWED: readonly JournalEntry[] = Object.freeze([]);

/** Past either, the customer's send_event checks go to the API until Autumn catches up. */
export const MAX_OWED_PER_CUSTOMER = 20_000;
export const MAX_UNSENT_AGE_MS = 5 * 60_000;

/**
 * One slot's journal, opened by the slot's owner thread only, so what it holds in memory is the file plus the appends
 * whose commit is still in flight. Those count as owed from the moment they are appended: the next check decides on them.
 * Whether Autumn holds an entry is kept in memory only: after a restart every owed entry is sent again, and deduplicated.
 */
export const openJournal = ({
	databasePath,
	now = Date.now,
}: {
	databasePath: string;
	now?: () => number;
}): Journal => {
	const ctx = { sqliteDb: openJournalDatabase({ databasePath }) };
	const lastSeqs = readLastJournalSeqs({ ctx });
	const owedByCustomer = new Map<string, readonly JournalEntry[]>();
	const unsent = new Set<JournalEntry>();
	let notifyCommitted = () => {};

	const groupCommit = createGroupCommit({
		commit: (entries: JournalEntry[]) => {
			insertJournalEntries({ ctx, entries });
			for (const entry of entries) unsent.add(entry);
			notifyCommitted();
		},
	});

	for (const read of readOwedJournalEntries({ ctx })) {
		const entry = deepFreeze(read);
		owedByCustomer.set(entry.customerId, [
			...owed({ customerId: entry.customerId }),
			entry,
		]);
		unsent.add(entry);
	}

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
		const entry = deepFreeze({ customerId, seq, appendedAt: now(), command });
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

	function takeUnsent({ limit }: { limit: number }): JournalEntry[] {
		const taken: JournalEntry[] = [];
		for (const entry of unsent) {
			if (taken.length === limit) break;
			taken.push(entry);
		}
		return taken;
	}

	function markSent({ entries }: { entries: JournalEntry[] }): void {
		for (const entry of entries) unsent.delete(entry);
	}

	function isBackedUp({ customerId }: { customerId: string }): boolean {
		const entries = owed({ customerId });
		if (entries.length > MAX_OWED_PER_CUSTOMER) return true;
		const oldestUnsent = entries.find((entry) => unsent.has(entry));
		return (
			oldestUnsent !== undefined &&
			now() - oldestUnsent.appendedAt > MAX_UNSENT_AGE_MS
		);
	}

	function reconcile({
		customerId,
		atomSeq,
	}: {
		customerId: string;
		atomSeq: number | null;
	}): void {
		if (atomSeq === null) return;
		const entries = owed({ customerId });
		const unseen = entries.filter(({ seq }) => seq > atomSeq);
		if (unseen.length === entries.length) return;
		deleteJournalEntriesUpTo({ ctx, customerId, seq: atomSeq });
		for (const entry of entries) if (entry.seq <= atomSeq) unsent.delete(entry);
		setOwed({ customerId, entries: unseen });
	}

	return {
		append,
		owed,
		unsent: takeUnsent,
		markSent,
		onCommitted: (listener) => {
			notifyCommitted = listener;
		},
		isBackedUp,
		reconcile,
		close: () => ctx.sqliteDb.close(),
	};
};
