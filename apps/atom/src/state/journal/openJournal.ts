import { callerKeyOf } from "@autumn/balance-engine";
import { ATOM_IDEMPOTENCY_TTL_MS } from "@autumn/byoc";
import { getAtomLogger } from "../../lib/logging/getAtomLogger.js";
import {
	encodeJournalEntries,
	readJournalWriterId,
	readLastJournalSeqs,
	readOwedJournalEntries,
} from "../repos/journalEntries.js";
import { PRUNE_CHUNK, readJournalKey } from "../repos/journalKeys.js";
import { openWrittenFile } from "../writer/openWrittenFile.js";
import { createGroupCommit } from "./createGroupCommit.js";
import type {
	HandedEntry,
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

/** A caller's key is held this long after its append; past it the row is only waiting for the prune. */
export const KEY_ROW_TTL_MS = ATOM_IDEMPOTENCY_TTL_MS;
const PRUNE_EVERY_MS = 60_000;

/** Unsent entries across every journal this thread has open: module state is the thread's own. */
let unsentOnThread = 0;
/** Each open journal's unsent entries, oldest commit first, so the thread's oldest is the first of one of them. */
const unsentByJournal = new Set<Set<JournalEntry>>();
let appendedOnThread = 0;
let appendFailedOnThread = 0;

/** A journal that refuses every commit would otherwise show as forwards alone, so its first failure is logged, then one line per interval. */
const APPEND_ERROR_LOG_INTERVAL_MS = 10_000;
let appendErrorLoggedAt = Number.NEGATIVE_INFINITY;
let commitsFailedSinceLogged = 0;

const logFailedCommit = ({
	error,
	entries,
	at,
}: {
	error: unknown;
	entries: number;
	at: number;
}): void => {
	commitsFailedSinceLogged++;
	if (at - appendErrorLoggedAt < APPEND_ERROR_LOG_INTERVAL_MS) return;
	const reason = error instanceof Error ? error.message : String(error);
	getAtomLogger().error(
		{
			error,
			type: "atom_journal_append_failed",
			data: { entries, commitsFailed: commitsFailedSinceLogged },
		},
		`A journal commit of ${entries} entries failed, left to the API: ${reason}`,
	);
	appendErrorLoggedAt = at;
	commitsFailedSinceLogged = 0;
};

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
	/** By customer, the caller keys appended whose commit has not settled: their rows are not in the file yet. */
	const inFlightKeys = new Map<string, Set<string>>();
	/** Entries appended whose commit has not settled, with that commit: a handoff waits for them, so none crosses half-written. */
	const committing = new Map<JournalEntry, Promise<void>>();

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
			try {
				await file.write(
					"insertJournalEntries",
					encodeJournalEntries({ entries }),
				);
			} catch (error) {
				logFailedCommit({ error, entries: entries.length, at: now() });
				throw error;
			}
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
		const entry = { customerId, writerId, seq, appendedAt: now(), command };
		owe({ entry });
		const key = command.type === "track" ? callerKeyOf({ command }) : null;
		if (key) holdInFlight({ customerId, key });
		const commit = groupCommit.add(entry);
		committing.set(
			entry,
			commit.catch(() => {}),
		);
		try {
			await commit;
			return entry;
		} catch (error) {
			appendFailedOnThread++;
			setOwed({
				customerId,
				entries: owed({ customerId }).filter((held) => held !== entry),
			});
			throw error;
		} finally {
			committing.delete(entry);
			if (key) releaseInFlight({ customerId, key });
		}
	}

	const isHeld = (entry: JournalEntry): boolean =>
		owed({ customerId: entry.customerId }).some(
			(held) => held.writerId === entry.writerId && held.seq === entry.seq,
		);

	/** Merged into each customer's owed entries by when they were granted: a new array, so a view replays it. */
	async function appendForeign({
		entries,
	}: {
		entries: HandedEntry[];
	}): Promise<number> {
		const fresh = entries.filter((entry) => !isHeld(entry));
		if (fresh.length === 0) return 0;
		const plain = fresh.map(({ sent: _, ...entry }) => entry);
		await file.write(
			"insertJournalEntries",
			encodeJournalEntries({ entries: plain }),
		);
		for (const customerId of new Set(plain.map((entry) => entry.customerId)))
			setOwed({
				customerId,
				entries: [
					...owed({ customerId }),
					...plain.filter((entry) => entry.customerId === customerId),
				].sort((left, right) => left.appendedAt - right.appendedAt),
			});
		fresh.forEach((entry, index) => {
			if (!entry.sent) holdUnsent(plain[index] as JournalEntry);
		});
		notifyCommitted();
		return fresh.length;
	}

	async function handoffs(): Promise<
		{ customerId: string; entries: HandedEntry[] }[]
	> {
		await Promise.all([...committing.values()]);
		// Appended since: still committing, and the caller keeps them.
		return [...owedByCustomer]
			.map(([customerId, entries]) => ({
				customerId,
				entries: entries
					.filter((entry) => !committing.has(entry))
					.map((entry) => ({ ...entry, sent: !unsent.has(entry) })),
			}))
			.filter(({ entries }) => entries.length > 0);
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
		const entries = owed({ customerId });
		// How far Autumn has seen each writer's seqs for the customer, whatever atom id it holds them under.
		const seen = new Map(
			[...new Set(entries.map((entry) => entry.writerId))].map((writer) => [
				writer,
				Object.values(atomSeqs ?? {}).find(
					(writerSeqs) => writer in writerSeqs,
				)?.[writer] ?? 0,
			]),
		);
		const isSeen = (entry: JournalEntry) =>
			entry.seq <= (seen.get(entry.writerId) ?? 0);
		const unseen = entries.filter((entry) => !isSeen(entry));
		if (unseen.length === entries.length) return Promise.resolve();
		for (const entry of entries) if (isSeen(entry)) releaseUnsent(entry);
		oldestUnsent({ customerId });
		setOwed({ customerId, entries: unseen });
		return Promise.all(
			[...seen]
				.filter(([, seq]) => seq > 0)
				.map(([writer, seq]) =>
					file.write(
						"deleteJournalEntriesUpTo",
						`${customerId}\u0000${writer}\u0000${seq}`,
					),
				),
		).then(() => {});
	}

	function forget({ customerId }: { customerId: string }): Promise<void> {
		for (const entry of owed({ customerId })) releaseUnsent(entry);
		unsentByCustomer.delete(customerId);
		setOwed({ customerId, entries: [] });
		return Promise.all([
			file.write("deleteCustomerJournalEntries", customerId),
			file.write("deleteCustomerJournalKeys", customerId),
		]).then(() => {});
	}

	function holdInFlight({
		customerId,
		key,
	}: {
		customerId: string;
		key: string;
	}): void {
		const keys = inFlightKeys.get(customerId);
		if (keys) keys.add(key);
		else inFlightKeys.set(customerId, new Set([key]));
	}

	function releaseInFlight({
		customerId,
		key,
	}: {
		customerId: string;
		key: string;
	}): void {
		const keys = inFlightKeys.get(customerId);
		keys?.delete(key);
		if (keys?.size === 0) inFlightKeys.delete(customerId);
	}

	function holdsKey({
		customerId,
		key,
	}: {
		customerId: string;
		key: string;
	}): boolean {
		return (
			inFlightKeys.get(customerId)?.has(key) === true ||
			readJournalKey({
				ctx,
				customerId,
				key,
				appendedSince: now() - KEY_ROW_TTL_MS,
			})
		);
	}

	let closed = false;
	/** One chunk per writer round trip, until a chunk comes back short. */
	async function pruneKeys(): Promise<void> {
		const appendedBefore = String(now() - KEY_ROW_TTL_MS);
		while (!closed) {
			const pruned = await file.write("pruneJournalKeys", appendedBefore);
			if (Number(pruned) < PRUNE_CHUNK) return;
		}
	}

	let pruneTimer: ReturnType<typeof setTimeout> | null = null;
	const untilNextPrune = () =>
		new Promise<void>((resolve) => {
			pruneTimer = setTimeout(resolve, PRUNE_EVERY_MS);
			pruneTimer.unref();
		});

	/** One loop per journal, so a prune the writer is slow to answer is never joined by another; a failed one waits for the next cycle. */
	async function runPruneLoop(): Promise<void> {
		while (!closed) {
			await untilNextPrune();
			if (closed) return;
			await pruneKeys().catch(() => {});
		}
	}
	void runPruneLoop();

	function close(): void {
		closed = true;
		if (pruneTimer) clearTimeout(pruneTimer);
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
		holdsKey,
		appendForeign,
		handoffs,
	};
};
