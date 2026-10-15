import type { TrackCommand } from "@autumn/balance-engine";
import { deepFreeze } from "../deepFreeze.js";
import {
	deleteCustomerJournalEntries,
	deleteJournalEntriesUpTo,
	insertJournalEntries,
	readJournalWriterId,
	readLastJournalSeqs,
	readOwedJournalEntries,
} from "../repos/journalEntries.js";
import { createGroupCommit } from "./createGroupCommit.js";
import { openJournalDatabase } from "./openJournalDatabase.js";
import type { Journal, JournalEntry } from "./types/journal.js";

/** Every customer with nothing owed shares it, so a view memoised on it stays valid. */
const NOTHING_OWED: readonly JournalEntry[] = Object.freeze([]);

/** Past any of these, a customer's send_event checks go to the API until Autumn catches up. */
export const MAX_OWED_PER_CUSTOMER = 20_000;
export const MAX_UNSENT_AGE_MS = 5 * 60_000;
export const MAX_UNSENT_PER_THREAD = 50_000;

/** Unsent entries across every journal this thread has open: module state is the thread's own. */
let unsentOnThread = 0;
/** Each open journal's unsent entries, oldest commit first, so the thread's oldest is the first of one of them. */
const unsentByJournal = new Set<Set<JournalEntry>>();
let appendedOnThread = 0;
let appendFailedOnThread = 0;

/** What this thread's journals hold that Autumn does not, and what they took and failed to take since boot. */
export const readJournalThreadStats = ({ now }: { now: number }) => {
	let oldestAppendedAt = now;
	for (const unsent of unsentByJournal) {
		const [oldest] = unsent;
		if (oldest && oldest.appendedAt < oldestAppendedAt)
			oldestAppendedAt = oldest.appendedAt;
	}
	return {
		journalUnsent: unsentOnThread,
		journalOldestUnsentMs: now - oldestAppendedAt,
		tracksAppended: appendedOnThread,
		appendFailed: appendFailedOnThread,
	};
};

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
	const writerId = readJournalWriterId({ ctx });
	const lastSeqs = readLastJournalSeqs({ ctx });
	const owedByCustomer = new Map<string, readonly JournalEntry[]>();
	const unsent = new Set<JournalEntry>();
	unsentByJournal.add(unsent);
	let notifyCommitted = () => {};

	function holdUnsent(entry: JournalEntry): void {
		unsent.add(entry);
		unsentOnThread++;
	}

	function releaseUnsent(entry: JournalEntry): void {
		if (unsent.delete(entry)) unsentOnThread--;
	}

	const groupCommit = createGroupCommit({
		commit: (entries: JournalEntry[]) => {
			insertJournalEntries({ ctx, entries });
			appendedOnThread += entries.length;
			for (const entry of entries) holdUnsent(entry);
			notifyCommitted();
		},
	});

	for (const read of readOwedJournalEntries({ ctx })) {
		const entry = deepFreeze(read);
		owedByCustomer.set(entry.customerId, [
			...owed({ customerId: entry.customerId }),
			entry,
		]);
		holdUnsent(entry);
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
			appendFailedOnThread++;
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
		for (const entry of entries) releaseUnsent(entry);
	}

	function isBackedUp({ customerId }: { customerId: string }): boolean {
		const entries = owed({ customerId });
		if (unsentOnThread > MAX_UNSENT_PER_THREAD) return true;
		if (entries.length > MAX_OWED_PER_CUSTOMER) return true;
		const oldestUnsent = entries.find((entry) => unsent.has(entry));
		return (
			oldestUnsent !== undefined &&
			now() - oldestUnsent.appendedAt > MAX_UNSENT_AGE_MS
		);
	}

	function reconcile({
		customerId,
		atomSeqs,
	}: {
		customerId: string;
		atomSeqs: Record<string, number> | null;
	}): void {
		const atomSeq = atomSeqs?.[writerId];
		if (atomSeq === undefined) return;
		const entries = owed({ customerId });
		const unseen = entries.filter(({ seq }) => seq > atomSeq);
		if (unseen.length === entries.length) return;
		deleteJournalEntriesUpTo({ ctx, customerId, seq: atomSeq });
		for (const entry of entries) if (entry.seq <= atomSeq) releaseUnsent(entry);
		setOwed({ customerId, entries: unseen });
	}

	function forget({ customerId }: { customerId: string }): void {
		deleteCustomerJournalEntries({ ctx, customerId });
		for (const entry of owed({ customerId })) releaseUnsent(entry);
		setOwed({ customerId, entries: [] });
	}

	function close(): void {
		for (const entry of [...unsent]) releaseUnsent(entry);
		unsentByJournal.delete(unsent);
		ctx.sqliteDb.close();
	}

	return {
		writerId,
		append,
		owed,
		unsent: takeUnsent,
		markSent,
		onCommitted: (listener) => {
			notifyCommitted = listener;
		},
		isBackedUp,
		reconcile,
		forget,
		close,
	};
};
