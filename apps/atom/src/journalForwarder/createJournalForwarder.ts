import type { AutumnLogger } from "@autumn/logging";
import type { AutumnClient } from "../autumnClient/types/autumnClient.js";
import type { JournalEntry } from "../state/journal/types/journal.js";
import type {
	ForwardedJournal,
	JournalForwarder,
} from "./types/journalForwarder.js";

/** Tracks per `tracks.append` request. */
const MAX_TRACKS_PER_REQUEST = 500;
/** A batch Autumn did not take is sent again after this, doubling up to the last. */
const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 30_000;
/** A sent deduction no push has shown applied by now has its customer pulled: the read says how far Autumn has seen. */
const PUSH_GRACE_MS = 60_000;

type JournalForwarderContext = {
	autumnClient: Pick<AutumnClient, "appendTracks">;
	logger: Pick<AutumnLogger, "warn">;
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
			const batch = journal.unsent({ limit: MAX_TRACKS_PER_REQUEST });
			if (batch.length === 0) return;
			try {
				await ctx.autumnClient.appendTracks({
					tokenHash: tokenHash(),
					writer: journal.writerId,
					tracks: batch.map(({ seq, command }) => ({ seq, command })),
				});
			} catch (error) {
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
		void wake();
		return {
			stop: () => {
				stopped = true;
			},
		};
	}

	function retire({
		retired,
		...forwarded
	}: ForwardedJournal & { retired: () => void }) {
		let stopped = false;
		const isStopped = () => stopped;
		// A journal that holds nothing to send is retired at once.
		if (forwarded.journal.unsent({ limit: 1 }).length === 0) retired();
		else
			void drain({ ...forwarded, isStopped }).then(() => {
				if (stopped) return;
				stopped = true;
				retired();
			});
		return {
			stop: () => {
				stopped = true;
			},
		};
	}

	return { forward, retire };
};
