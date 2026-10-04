import {
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
	type TrackCommand,
} from "@autumn/balance-engine";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	DecidedMutation,
	MutationSubmission,
} from "../writer/types/mutation.js";

/** A track waiting for its subject's turn, and the caller waiting for its decision. */
export type QueuedTrack = {
	command: TrackCommand;
	submission: MutationSubmission<never>;
	/** Decides it the way a lone track is: ensured, then decided, retried once if its rows left mid-way. */
	decideAlone(): Promise<DecidedMutation<never>>;
	/** Decided alone in its turn, never in a run: a queued command stamps its own source on its record. */
	solo: boolean;
};

type WaitingTrack = QueuedTrack & {
	resolve(decided: DecidedMutation<never>): void;
	reject(cause: unknown): void;
};

export type TrackRuns = {
	submit(track: QueuedTrack): Promise<DecidedMutation<never>>;
};

/**
 * Sync tracks for one subject that arrive in the same turn, on any connection, are decided as one run:
 * the subject is ensured once and the writer decides them in order in one critical section. Every track
 * for a subject with tracks waiting takes its turn behind them, so tracks still decide in arrival order.
 */
export const createTrackRuns = ({
	scope,
}: {
	scope: PartitionProcessorScope;
}): TrackRuns => {
	const waitingBySubject = new Map<string, WaitingTrack[]>();

	function submit(track: QueuedTrack): Promise<DecidedMutation<never>> {
		const subjectKey = meteringIdentityToSubjectKey({
			identity: track.command.identity,
		});
		let waiting = waitingBySubject.get(subjectKey);
		if (!waiting && track.solo) return track.decideAlone();
		const { promise, resolve, reject } =
			Promise.withResolvers<DecidedMutation<never>>();
		if (!waiting) {
			const queue: WaitingTrack[] = [];
			waiting = queue;
			waitingBySubject.set(subjectKey, queue);
			setImmediate(() => void drain({ subjectKey, queue }));
		}
		waiting.push({ ...track, resolve, reject });
		return promise;
	}

	/** Until the subject has nothing waiting: tracks that arrive while a turn is decided wait behind it. */
	async function drain({
		subjectKey,
		queue,
	}: {
		subjectKey: string;
		queue: WaitingTrack[];
	}): Promise<void> {
		try {
			while (queue.length > 0) await decideInOrder({ tracks: queue.splice(0) });
		} finally {
			waitingBySubject.delete(subjectKey);
		}
	}

	async function decideInOrder({
		tracks,
	}: {
		tracks: WaitingTrack[];
	}): Promise<void> {
		let start = 0;
		while (start < tracks.length) {
			const track = tracks[start];
			if (!track) return;
			if (track.solo) {
				await decideAlone({ track });
				start++;
				continue;
			}
			let end = start;
			while (end < tracks.length && !tracks[end]?.solo) end++;
			await decideRun({ run: tracks.slice(start, end) });
			start = end;
		}
	}

	async function decideAlone({
		track,
	}: {
		track: WaitingTrack;
	}): Promise<void> {
		try {
			track.resolve(await track.decideAlone());
		} catch (cause) {
			track.reject(cause);
		}
	}

	async function decideRun({ run }: { run: WaitingTrack[] }): Promise<void> {
		const [first] = run;
		if (!first) return;
		try {
			await ensureSubjectCurrent({ scope, command: first.command });
		} catch {
			// Each track hears its own failure the way a lone track would.
			for (const track of run) await decideAlone({ track });
			return;
		}
		const decidable = decidableLength({
			identity: first.command.identity,
			run,
		});
		const outcomes =
			decidable === 0
				? []
				: scope.ctx.writer.decideRun({
						identity: first.command.identity,
						submissions: run
							.slice(0, decidable)
							.map((track) => track.submission),
						stopsRun: isGoneMidRequest,
					});
		for (const [index, track] of run.entries()) {
			const outcome = outcomes[index];
			if (outcome?.kind === "decided") track.resolve(outcome.decided);
			else if (outcome?.kind === "failed") track.reject(outcome.cause);
			else await decideAlone({ track });
		}
	}

	/** How many tracks from the front decide on the ensured rows: a later one whose cycle has ended needs its reset first. */
	function decidableLength({
		identity,
		run,
	}: {
		identity: MeteringIdentity;
		run: WaitingTrack[];
	}): number {
		const state = scope.ctx.writer.readFreshestState({ identity });
		if (!state) return 0;
		for (let index = 1; index < run.length; index++) {
			const asOf = run[index]?.command.occurredAt;
			if (asOf === undefined || resetMayBeDue({ state, asOf })) return index;
		}
		return run.length;
	}

	return { submit };
};
