import {
	encodeJournalEntries,
	readJournalWriterId,
	readLastJournalSeqs,
	readOwedJournalEntries,
} from "../repos/journalEntries.js";
import { openWrittenFile } from "../writer/openWrittenFile.js";
import { createGroupCommit } from "./createGroupCommit.js";
import type {
	Journal,
	JournalEntry,
	JournaledCommand,
} from "./types/journal.js";

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
	const file = openWrittenFile({ databasePath, kind: "journal" });
	const ctx = { sqliteDb: file.sqliteDb };
	const writerId = readJournalWriterId({ ctx });
	const lastSeqs = readLastJournalSeqs({ ctx });
	/** Grown in place by an append; anything else that changes it replaces it, so a reader can tell the two apart. */
	const owedByCustomer = new Map<string, JournalEntry[]>();
	const unsent = new Set<JournalEntry>();
	unsentByJournal.add(unsent);
	/** By customer, the entry Autumn refused that its later entries wait behind. */
	const parkedCustomers = new Map<string, JournalEntry>();
	/** Each customer's unsent entries in seq order, from `head`: those sent since leave the front as it is next settled. */
	const unsentByCustomer = new Map<
		string,
		{ entries: JournalEntry[]; head: number }
	>();
	let notifyCommitted = () => {};

	function holdUnsent(entry: JournalEntry): void {
		unsent.add(entry);
		unsentOnThread++;
		const queue = unsentByCustomer.get(entry.customerId);
		if (queue) queue.entries.push(entry);
		else unsentByCustomer.set(entry.customerId, { entries: [entry], head: 0 });
	}

	function releaseUnsent(entry: JournalEntry): void {
		if (unsent.delete(entry)) unsentOnThread--;
		if (parkedCustomers.get(entry.customerId) === entry)
			parkedCustomers.delete(entry.customerId);
	}

	/** O(1) amortised: each entry leaves the front once, and the array is copied only once half of it has left. */
	function oldestUnsent({
		customerId,
	}: {
		customerId: string;
	}): JournalEntry | undefined {
		const queue = unsentByCustomer.get(customerId);
		if (!queue) return undefined;
		const { entries } = queue;
		let oldest = entries[queue.head];
		while (oldest && !unsent.has(oldest)) oldest = entries[++queue.head];
		if (!oldest) {
			unsentByCustomer.delete(customerId);
			return undefined;
		}
		if (queue.head > entries.length / 2) {
			queue.entries = entries.slice(queue.head);
			queue.head = 0;
		}
		return oldest;
	}

	const groupCommit = createGroupCommit({
		commit: async (entries: JournalEntry[]) => {
			await file.write(
				"insertJournalEntries",
				encodeJournalEntries({ entries }),
			);
			appendedOnThread += entries.length;
			for (const entry of entries) holdUnsent(entry);
			notifyCommitted();
		},
	});

	for (const entry of readOwedJournalEntries({ ctx })) {
		owe({ entry });
		holdUnsent(entry);
	}

	function owed({
		customerId,
	}: {
		customerId: string;
	}): readonly JournalEntry[] {
		return owedByCustomer.get(customerId) ?? NOTHING_OWED;
	}

	/** O(1): the customer's array grows, never copied, however much it owes. */
	function owe({ entry }: { entry: JournalEntry }): void {
		const entries = owedByCustomer.get(entry.customerId);
		if (entries) entries.push(entry);
		else owedByCustomer.set(entry.customerId, [entry]);
	}

	function setOwed({
		customerId,
		entries,
	}: {
		customerId: string;
		entries: JournalEntry[];
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
		command: JournaledCommand;
	}): Promise<JournalEntry> {
		const seq = (lastSeqs.get(customerId) ?? 0) + 1;
		lastSeqs.set(customerId, seq);
		const entry = { customerId, seq, appendedAt: now(), command };
		owe({ entry });
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
			if (!parkedCustomers.has(entry.customerId)) taken.push(entry);
		}
		return taken;
	}

	function park({ entry }: { entry: JournalEntry }): void {
		if (unsent.has(entry)) parkedCustomers.set(entry.customerId, entry);
	}

	function markSent({ entries }: { entries: JournalEntry[] }): void {
		for (const entry of entries) releaseUnsent(entry);
		for (const customerId of new Set(entries.map((entry) => entry.customerId)))
			oldestUnsent({ customerId });
	}

	function isBackedUp({ customerId }: { customerId: string }): boolean {
		const entries = owed({ customerId });
		if (unsentOnThread > MAX_UNSENT_PER_THREAD) return true;
		if (entries.length > MAX_OWED_PER_CUSTOMER) return true;
		const oldest = oldestUnsent({ customerId });
		return (
			oldest !== undefined && now() - oldest.appendedAt > MAX_UNSENT_AGE_MS
		);
	}

	function reconcile({
		customerId,
		atomSeqs,
	}: {
		customerId: string;
		atomSeqs: Record<string, Record<string, number>> | null;
	}): Promise<void> {
		const atomSeq = Object.values(atomSeqs ?? {}).find(
			(writerSeqs) => writerId in writerSeqs,
		)?.[writerId];
		if (atomSeq === undefined) return Promise.resolve();
		const entries = owed({ customerId });
		const unseen = entries.filter(({ seq }) => seq > atomSeq);
		if (unseen.length === entries.length) return Promise.resolve();
		for (const entry of entries) if (entry.seq <= atomSeq) releaseUnsent(entry);
		oldestUnsent({ customerId });
		setOwed({ customerId, entries: unseen });
		return file
			.write("deleteJournalEntriesUpTo", `${customerId}\u0000${atomSeq}`)
			.then(() => {});
	}

	function forget({ customerId }: { customerId: string }): Promise<void> {
		for (const entry of owed({ customerId })) releaseUnsent(entry);
		unsentByCustomer.delete(customerId);
		setOwed({ customerId, entries: [] });
		return file
			.write("deleteCustomerJournalEntries", customerId)
			.then(() => {});
	}

	function close(): void {
		for (const entry of [...unsent]) releaseUnsent(entry);
		unsentByJournal.delete(unsent);
		file.close();
	}

	return {
		writerId,
		append,
		owed,
		unsent: takeUnsent,
		countUnsent: () => unsent.size,
		park,
		parked: () => [...parkedCustomers.values()],
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
