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
/** How often a drain looks again at what the journals still hold. */
const DRAIN_POLL_MS = 20;

type JournalForwarderContext = {
	autumnClient: Pick<AutumnClient, "appendTracks">;
	logger: Pick<AutumnLogger, "info" | "warn">;
	counters?: Pick<ThreadCounters, "add">;
	sleep?: (ms: number) => Promise<unknown>;
};

type Draining = ForwardedJournal & { isStopped: () => boolean };

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

	/** One line per run of failures, so an Autumn that is down cannot flood the logs. */
	function logFailure({ error }: { error: unknown }): void {
		ctx.logger.warn(
			{ type: "atom_journal_forward_failed", error },
			"Autumn did not take the Atom's journaled deductions; they are sent again until it does",
		);
	}

	async function pullCustomersStillOwing({
		journal,
		pulls,
		sent,
		isStopped,
	}: Draining & { sent: JournalEntry[] }): Promise<void> {
		await sleep(PUSH_GRACE_MS);
		if (isStopped()) return;
		const stillOwed = sent.filter((entry) =>
			journal.owed({ customerId: entry.customerId }).includes(entry),
		);
		for (const customerId of new Set(
			stillOwed.map((entry) => entry.customerId),
		))
			pulls.request({ customerId, entityId: null });
	}

	/** Until nothing is left to send or the forwarding stops. */
	async function drain(draining: Draining): Promise<void> {
		const { journal, tokenHash, isStopped } = draining;
		let retryMs = FIRST_RETRY_MS;
		while (!isStopped()) {
			const waiting = journal.unsent({ limit: MAX_TRACKS_PER_REQUEST }).length;
			if (waiting === 0) return;
			if (waiting < MAX_TRACKS_PER_REQUEST) await Bun.sleep(LINGER_MS);
			if (isStopped()) return;
			const batch = journal.unsent({ limit: MAX_TRACKS_PER_REQUEST });
			try {
				await ctx.autumnClient.appendTracks({
					tokenHash: tokenHash(),
					writer: journal.writerId,
					tracks: batch.map(({ seq, command }) => ({ seq, command })),
				});
			} catch (error) {
				ctx.counters?.add("journalForwardFailed");
				if (retryMs === FIRST_RETRY_MS) logFailure({ error });
				await sleep(retryMs);
				retryMs = Math.min(retryMs * 2, LAST_RETRY_MS);
				continue;
			}
			if (isStopped()) return;
			journal.markSent({ entries: batch });
			retryMs = FIRST_RETRY_MS;
			void pullCustomersStillOwing({ ...draining, sent: batch });
		}
	}

	function forward(forwarded: ForwardedJournal) {
		let stopped = false;
		let draining = false;
		let woken = false;
		const isStopped = () => stopped;

		/** A commit while a drain runs is picked up by that drain's next pass, never by a second drain. */
		async function wake(): Promise<void> {
			woken = true;
			if (draining) return;
			draining = true;
			while (woken && !stopped) {
				woken = false;
				await drain({ ...forwarded, isStopped });
			}
			draining = false;
		}

		forwarded.journal.onCommitted(() => void wake());
		handed.add(forwarded.journal);
		void wake();
		return {
			stop: () => {
				stopped = true;
				handed.delete(forwarded.journal);
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
			void drain({ ...forwarded, isStopped }).then(() => {
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
