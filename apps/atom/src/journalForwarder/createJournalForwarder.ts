import type { AutumnLogger } from "@autumn/logging";
import { AutumnClientError } from "../autumnClient/autumnClientError.js";
import type { AutumnClient } from "../autumnClient/types/autumnClient.js";
import type { Journal, JournalEntry } from "../state/journal/types/journal.js";
import { timeStage } from "../threads/stats/stageClock.js";
import type { ThreadCounters } from "../threads/stats/threadStats.js";
import { journalEntryToHandIn } from "./journalEntryToHandIn.js";
import type {
	ForwardedJournal,
	JournalForwarder,
} from "./types/journalForwarder.js";

/** Tracks per `tracks.append` request. */
const MAX_TRACKS_PER_REQUEST = 500;
/** A batch short of the cap waits this long for the deductions right behind it: a burst becomes one call, not one each. */
const LINGER_MS = 20;
/** A batch Autumn did not take, or a track it refused alone, is sent again after this, doubling up to the last. */
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
	/** Starts the drain again when it may have stopped: a parked customer's entries are free to go. */
	resume: () => void;
};

/** A track to hand in, beside the journal it is owed from. */
type Unsent = { forwarded: ForwardedJournal; entry: JournalEntry };

/** The forwarder's requests on this thread since boot, their tracks, and the round trips since the stats tick last read them. */
const RTT_BUCKETS = 64;
const RTT_BUCKETS_PER_DOUBLING = 2;
let forwardRequests = 0;
let forwardTracks = 0;
const rttBuckets = new Array<number>(RTT_BUCKETS).fill(0);
const recordRoundTrip = ({
	rttUs,
	tracks,
}: {
	rttUs: number;
	tracks: number;
}) => {
	forwardRequests++;
	forwardTracks += tracks;
	const bucket = Math.floor(Math.log2(1 + rttUs) * RTT_BUCKETS_PER_DOUBLING);
	rttBuckets[Math.min(RTT_BUCKETS - 1, bucket)]++;
};

/** The requests and tracks since boot, and the p99 round trip (post to reply) since the last read, in µs. */
export const readJournalForwarderThreadStats = () => {
	const trips = rttBuckets.reduce((sum, count) => sum + count, 0);
	let p99Bucket = 0;
	for (let seen = 0; p99Bucket < RTT_BUCKETS; p99Bucket++) {
		seen += rttBuckets[p99Bucket] ?? 0;
		if (seen >= trips * 0.99) break;
	}
	rttBuckets.fill(0);
	return {
		journalForwardRequests: forwardRequests,
		journalForwardTracks: forwardTracks,
		journalForwardRttP99Us:
			trips === 0
				? 0
				: Math.round(2 ** ((p99Bucket + 1) / RTT_BUCKETS_PER_DOUBLING) - 1),
	};
};

/** What Autumn took of a batch, and the tracks it refused alone. */
type Sent = { taken: Unsent[]; refused: Unsent[] };

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

/** Autumn refused the request as unreadable: a bad track in it, or an Atom it cannot read at all. */
const isRefusal = (error: unknown) =>
	error instanceof AutumnClientError && error.status === 400;

/**
 * The journal's way to Autumn: what it holds is posted in batches, each customer's in seq order, and marked sent once
 * Autumn holds it. A batch Autumn did not take is sent again, never dropped: Autumn deduplicates. A refused batch is
 * sent again in halves, and a track Autumn refuses alone while taking others parks its customer behind it.
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

	async function post(batch: Unsent[]): Promise<void> {
		const [first] = batch;
		if (!first) return;
		const postedAt = performance.now();
		await timeStage("forwardHandIn", () =>
			ctx.autumnClient.appendTracks({
				tokenHash: first.forwarded.tokenHash(),
				tracks: batch.map(({ entry }) =>
					journalEntryToHandIn({ writerId: entry.writerId, entry }),
				),
			}),
		);
		recordRoundTrip({
			rttUs: (performance.now() - postedAt) * 1000,
			tracks: batch.length,
		});
	}

	/** What Autumn took of a batch, and the tracks it refused alone; throws when it took none of it. */
	async function sendBatch(batch: Unsent[]): Promise<Sent> {
		try {
			await post(batch);
			return { taken: batch, refused: [] };
		} catch (error) {
			if (!isRefusal(error) || batch.length === 1) throw error;
			// Autumn taking any part shows it reads this Atom, so a track it refused alone is that track's own fault.
			const sent: Sent = { taken: [], refused: [] };
			const halves = await sendInHalves({ batch, sent }).then(
				() => sent,
				() => null,
			);
			if (!halves?.taken.length) throw error;
			return halves;
		}
	}

	/** Down to single tracks; a customer refused once has none of its later tracks sent, so its seqs stay in order. */
	async function sendInHalves({
		batch,
		sent,
	}: {
		batch: Unsent[];
		sent: Sent;
	}): Promise<void> {
		const half = Math.ceil(batch.length / 2);
		for (const part of [batch.slice(0, half), batch.slice(half)]) {
			const sendable = part.filter(
				({ forwarded, entry }) =>
					!sent.refused.some(
						(refused) =>
							refused.forwarded === forwarded &&
							refused.entry.customerId === entry.customerId,
					),
			);
			if (sendable.length === 0) continue;
			try {
				await post(sendable);
				sent.taken.push(...sendable);
			} catch (error) {
				if (!isRefusal(error)) throw error;
				if (sendable.length === 1) sent.refused.push(...sendable);
				else await sendInHalves({ batch: sendable, sent });
			}
		}
	}

	/** Sent alone until Autumn takes it, or it leaves the journal some other way; then the customer's entries go on. */
	async function retryParked({
		forwarded,
		entry,
		draining: { isStopped, resume },
	}: Unsent & { draining: Draining }): Promise<void> {
		for (
			let retryMs = FIRST_RETRY_MS;
			;
			retryMs = Math.min(retryMs * 2, LAST_RETRY_MS)
		) {
			await sleep(retryMs);
			if (isStopped() || !forwarded.journal.parked().includes(entry)) return;
			const taken = await post([{ forwarded, entry }]).then(
				() => true,
				() => false,
			);
			if (taken) {
				markSent({ forwarded, sent: [entry], isStopped });
				resume();
				return;
			}
		}
	}

	function park({
		forwarded,
		entry,
		draining,
	}: Unsent & { draining: Draining }): void {
		forwarded.journal.park({ entry });
		ctx.logger.warn(
			{
				type: "atom_journal_track_parked",
				writerId: entry.writerId,
				customerId: entry.customerId,
				seq: entry.seq,
			},
			"Autumn refused one journaled deduction on its own; it is sent alone until Autumn takes it, and its customer's wait behind it",
		);
		void retryParked({ forwarded, entry, draining });
	}

	function markSent({
		forwarded,
		sent,
		isStopped,
	}: {
		forwarded: ForwardedJournal;
		sent: JournalEntry[];
		isStopped: () => boolean;
	}): void {
		forwarded.journal.markSent({ entries: sent });
		void pullCustomersStillOwing({ forwarded, sent, isStopped });
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
	async function drain(draining: Draining): Promise<void> {
		const { journalsOf, isStopped } = draining;
		let retryMs = FIRST_RETRY_MS;
		while (!isStopped()) {
			const waiting = unsentOf(journalsOf()).length;
			if (waiting === 0) return;
			if (waiting < MAX_TRACKS_PER_REQUEST) await Bun.sleep(LINGER_MS);
			if (isStopped()) return;
			const journals = journalsOf();
			const batch = timeStage("forwardHandIn", () => unsentOf(journals));
			if (batch.length === 0) return;
			let sent: Sent;
			try {
				sent = await sendBatch(batch);
			} catch (error) {
				ctx.counters?.add("journalForwardFailed");
				if (retryMs === FIRST_RETRY_MS) logFailure({ error });
				await sleep(retryMs);
				retryMs = Math.min(retryMs * 2, LAST_RETRY_MS);
				continue;
			}
			if (isStopped()) return;
			retryMs = FIRST_RETRY_MS;
			for (const unsent of sent.refused) park({ ...unsent, draining });
			const stillForwarded = new Set(journalsOf());
			for (const forwarded of journals) {
				if (!stillForwarded.has(forwarded)) continue;
				const entries = sent.taken
					.filter((unsent) => unsent.forwarded === forwarded)
					.map(({ entry }) => entry);
				if (entries.length > 0)
					markSent({ forwarded, sent: entries, isStopped });
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
			resume: () => void wake(folder),
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
		const { journal } = forwarded;
		const draining = { journalsOf: () => [forwarded], isStopped, resume() {} };
		// A journal that holds nothing to send is retired at once.
		if (journal.countUnsent() === 0) retired();
		else {
			handed.add(journal);
			void (async () => {
				while (!stopped && journal.countUnsent() > 0) {
					await drain(draining);
					// Its file goes once retired, so a parked customer is waited on until Autumn takes its refused track.
					if (journal.countUnsent() > 0) await sleep(LAST_RETRY_MS);
				}
				if (stopped) return;
				stop();
				retired();
			})();
		}
		return { stop };
	}

	/** What is still unsent when the deadline passes stays in its file, and is sent again on the next boot. */
	async function drainAll({ deadlineMs }: { deadlineMs: number }) {
		const deadline = Date.now() + deadlineMs;
		const holdsUnsent = () =>
			[...handed].some((journal) => journal.countUnsent() > 0);
		while (holdsUnsent() && Date.now() < deadline)
			await Bun.sleep(DRAIN_POLL_MS);
		const unsent = [...handed].reduce(
			(sum, journal) => sum + journal.countUnsent(),
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
