import type { AutumnLogger } from "@autumn/logging";
import type { AutumnClient } from "../autumnClient/types/autumnClient.js";
import type { Journal, JournalEntry } from "../state/journal/types/journal.js";
import type { ThreadCounters } from "../threads/stats/threadStats.js";
import type {
	ForwardedJournal,
	JournalForwarder,
} from "./types/journalForwarder.js";

/** Tracks per `tracks.append` request. */
const MAX_TRACKS_PER_REQUEST = 500;
/** A batch short of the cap waits this long for the deductions right behind it: a burst becomes one call, not one each. */
const LINGER_MS = 20;
/** A batch Autumn did not take is sent again after this, doubling up to the last. */
const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 30_000;
/** A sent deduction no push has shown applied by now has its customer pulled: the read says how far Autumn has seen. */
const PUSH_GRACE_MS = 60_000;
/** A pull that did not settle it (Autumn not caught up, or the pull failed) is tried again, this many times in all. */
const SETTLE_ROUNDS = 3;
/** How often a drain looks again at what the journals still hold. */
const DRAIN_POLL_MS = 20;

type JournalForwarderContext = {
	autumnClient: Pick<AutumnClient, "appendTracks">;
	logger: Pick<AutumnLogger, "info" | "warn">;
	counters?: Pick<ThreadCounters, "add">;
	sleep?: (ms: number) => Promise<unknown>;
};

type FolderForwarding = {
	journals: Set<ForwardedJournal>;
	draining: boolean;
	woken: boolean;
};

/** Journals sent together: one folder's, which prove themselves with one token hash. */
type Draining = {
	journalsOf: () => ForwardedJournal[];
	isStopped: () => boolean;
};

/** A track to hand in, beside the journal it is owed from. */
type Unsent = { forwarded: ForwardedJournal; entry: JournalEntry };

/** Up to one request's worth of what the journals hold unsent, journal by journal. */
const unsentOf = (journals: ForwardedJournal[]): Unsent[] => {
	const taken: Unsent[] = [];
	for (const forwarded of journals) {
		const limit = MAX_TRACKS_PER_REQUEST - taken.length;
		if (limit === 0) break;
		for (const entry of forwarded.journal.unsent({ limit }))
			taken.push({ forwarded, entry });
	}
	return taken;
};

/**
 * The journal's way to Autumn: what it holds is posted in batches, each customer's in seq order, and marked sent once
 * Autumn holds it. A batch Autumn did not take, for any reason, is sent again, never dropped: Autumn deduplicates.
 */
export const createJournalForwarder = ({
	ctx,
}: {
	ctx: JournalForwarderContext;
}): JournalForwarder => {
	const sleep = ctx.sleep ?? Bun.sleep;
	/** Every journal being handed to Autumn now: what a drain waits on. */
	const handed = new Set<Journal>();
	/** By folder: its journals share one drain, so a thread's deductions go to Autumn in one request, not one per slot. */
	const folders = new Map<() => string, FolderForwarding>();

	/** One line per run of failures, so an Autumn that is down cannot flood the logs. */
	function logFailure({ error }: { error: unknown }): void {
		ctx.logger.warn(
			{ type: "atom_journal_forward_failed", error },
			"Autumn did not take the Atom's journaled deductions; they are sent again until it does",
		);
	}

	async function pullCustomersStillOwing({
		forwarded: { journal, pulls },
		sent,
		isStopped,
	}: {
		forwarded: ForwardedJournal;
		sent: JournalEntry[];
		isStopped: () => boolean;
	}): Promise<void> {
		for (let round = 0; round < SETTLE_ROUNDS; round++) {
			await sleep(PUSH_GRACE_MS);
			if (isStopped()) return;
			const stillOwed = sent.filter((entry) =>
				journal.owed({ customerId: entry.customerId }).includes(entry),
			);
			if (stillOwed.length === 0) return;
			await Promise.all(
				[...new Set(stillOwed.map((entry) => entry.customerId))].map(
					(customerId) => pulls.settle({ customerId }),
				),
			);
		}
	}

	/** Until nothing is left to send or the forwarding stops. */
	async function drain({ journalsOf, isStopped }: Draining): Promise<void> {
		let retryMs = FIRST_RETRY_MS;
		while (!isStopped()) {
			const waiting = unsentOf(journalsOf()).length;
			if (waiting === 0) return;
			if (waiting < MAX_TRACKS_PER_REQUEST) await Bun.sleep(LINGER_MS);
			if (isStopped()) return;
			const journals = journalsOf();
			const batch = unsentOf(journals);
			const [first] = batch;
			if (!first) return;
			try {
				await ctx.autumnClient.appendTracks({
					tokenHash: first.forwarded.tokenHash(),
					tracks: batch.map(({ forwarded, entry }) => ({
						writerId: forwarded.journal.writerId,
						seq: entry.seq,
						command: entry.command,
					})),
				});
			} catch (error) {
				ctx.counters?.add("journalForwardFailed");
				if (retryMs === FIRST_RETRY_MS) logFailure({ error });
				await sleep(retryMs);
				retryMs = Math.min(retryMs * 2, LAST_RETRY_MS);
				continue;
			}
			if (isStopped()) return;
			retryMs = FIRST_RETRY_MS;
			const stillForwarded = new Set(journalsOf());
			for (const forwarded of journals) {
				if (!stillForwarded.has(forwarded)) continue;
				const sent = batch
					.filter((unsent) => unsent.forwarded === forwarded)
					.map(({ entry }) => entry);
				if (sent.length === 0) continue;
				forwarded.journal.markSent({ entries: sent });
				void pullCustomersStillOwing({ forwarded, sent, isStopped });
			}
		}
	}

	/** A commit while the folder's drain runs is picked up by that drain's next pass, never by a second drain. */
	async function wake(folder: FolderForwarding): Promise<void> {
		folder.woken = true;
		if (folder.draining) return;
		folder.draining = true;
		const draining = {
			journalsOf: () => [...folder.journals],
			isStopped: () => folder.journals.size === 0,
		};
		while (folder.woken && !draining.isStopped()) {
			folder.woken = false;
			await drain(draining);
		}
		folder.draining = false;
	}

	function forward(forwarded: ForwardedJournal) {
		const folder = folders.get(forwarded.tokenHash) ?? {
			journals: new Set<ForwardedJournal>(),
			draining: false,
			woken: false,
		};
		folders.set(forwarded.tokenHash, folder);
		folder.journals.add(forwarded);
		forwarded.journal.onCommitted(() => void wake(folder));
		handed.add(forwarded.journal);
		void wake(folder);
		return {
			stop: () => {
				folder.journals.delete(forwarded);
				handed.delete(forwarded.journal);
				if (folder.journals.size === 0) folders.delete(forwarded.tokenHash);
			},
		};
	}

	function retire({
		retired,
		...forwarded
	}: ForwardedJournal & { retired: () => void }) {
		let stopped = false;
		const isStopped = () => stopped;
		const stop = () => {
			stopped = true;
			handed.delete(forwarded.journal);
		};
		// A journal that holds nothing to send is retired at once.
		if (forwarded.journal.unsent({ limit: 1 }).length === 0) retired();
		else {
			handed.add(forwarded.journal);
			void drain({ journalsOf: () => [forwarded], isStopped }).then(() => {
				if (stopped) return;
				stop();
				retired();
			});
		}
		return { stop };
	}

	/** What is still unsent when the deadline passes stays in its file, and is sent again on the next boot. */
	async function drainAll({ deadlineMs }: { deadlineMs: number }) {
		const deadline = Date.now() + deadlineMs;
		const holdsUnsent = () =>
			[...handed].some((journal) => journal.unsent({ limit: 1 }).length > 0);
		while (holdsUnsent() && Date.now() < deadline)
			await Bun.sleep(DRAIN_POLL_MS);
		const unsent = [...handed].reduce(
			(sum, journal) =>
				sum + journal.unsent({ limit: Number.MAX_SAFE_INTEGER }).length,
			0,
		);
		const fields = { journals: handed.size, unsent };
		if (unsent === 0)
			ctx.logger.info(
				{ type: "atom_journal_drained", ...fields },
				"Autumn holds every deduction this thread journaled",
			);
		else
			ctx.logger.warn(
				{ type: "atom_journal_drain_deadline", ...fields },
				`${unsent} journaled deductions were not sent before the deadline; they are sent on the next boot`,
			);
	}

	return { forward, retire, drainAll };
};
