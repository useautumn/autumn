import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationSubmission,
} from "../writer/types/mutation.js";

type QueuedTrackBase = {
	command: TrackCommand;
	submission: MutationSubmission<never>;
	/** Decides it the way a lone track is: ensured, then decided, retried once if its rows left mid-way. */
	decideAlone(): Promise<DecidedMutation<never>>;
};

/** A sync track: answered from its run once its record commits. */
export type SyncTrack = QueuedTrackBase & {
	answer(params: {
		committed: CommittedMutation;
		/** The subject after the whole run, for a reply that shares one snapshot per run. */
		runState: SubjectState | null;
	}): TrackReply;
};

type WaitingTrack =
	| (SyncTrack & {
			kind: "sync";
			resolve(reply: TrackReply): void;
			reject(cause: unknown): void;
	  })
	| (QueuedTrackBase & {
			kind: "solo";
			resolve(decided: DecidedMutation<never>): void;
			reject(cause: unknown): void;
	  })
	/** Another command for the customer: released once everything queued before it has decided. */
	| { kind: "turn"; resolve(): void };

type SubjectQueue = { waiting: WaitingTrack[] };

export type TrackRunCounters = {
	trackRuns: number;
	trackRunTracks: number;
	trackRunMax: number;
};

export type TrackRuns = {
	/** A sync track, decided in its subject's next run and answered when its record commits. */
	track(track: SyncTrack): Promise<TrackReply>;
	/** A queued track, decided alone but in its turn behind any run waiting for its subject. */
	decideInTurn(track: QueuedTrackBase): Promise<DecidedMutation<never>>;
	/** Resolves once everything waiting for the customer when called has decided; null when nothing is. */
	whenDecided(params: { identity: MeteringIdentity }): Promise<void> | null;
	readCounters(): TrackRunCounters;
};

/**
 * Sync tracks for one subject that arrive in the same turn, on any connection, are decided as one run:
 * the subject is ensured once and the writer decides them in order in one critical section. Anything else
 * for the customer takes its turn behind a waiting run, so commands still decide in arrival order.
 */
export const createTrackRuns = ({
	scope,
}: {
	scope: PartitionProcessorScope;
}): TrackRuns => {
	const queuesBySubject = new Map<string, SubjectQueue>();
	const queuesByCustomer = new Map<string, Set<SubjectQueue>>();
	const counters: TrackRunCounters = {
		trackRuns: 0,
		trackRunTracks: 0,
		trackRunMax: 0,
	};

	function queueFor({
		identity,
	}: {
		identity: MeteringIdentity;
	}): SubjectQueue {
		const subjectKey = meteringIdentityToSubjectKey({ identity });
		const known = queuesBySubject.get(subjectKey);
		if (known) return known;
		const customerKey = meteringIdentityToPartitionKey({ identity });
		const queue: SubjectQueue = { waiting: [] };
		queuesBySubject.set(subjectKey, queue);
		const customerQueues = queuesByCustomer.get(customerKey) ?? new Set();
		customerQueues.add(queue);
		queuesByCustomer.set(customerKey, customerQueues);
		function forget(): void {
			queuesBySubject.delete(subjectKey);
			customerQueues.delete(queue);
			if (customerQueues.size === 0) queuesByCustomer.delete(customerKey);
		}
		setImmediate(() => void drain({ queue, forget }));
		return queue;
	}

	function track(track: SyncTrack): Promise<TrackReply> {
		const { promise, resolve, reject } = Promise.withResolvers<TrackReply>();
		queueFor({ identity: track.command.identity }).waiting.push({
			...track,
			kind: "sync",
			resolve,
			reject,
		});
		return promise;
	}

	function decideInTurn(
		track: QueuedTrackBase,
	): Promise<DecidedMutation<never>> {
		const subjectKey = meteringIdentityToSubjectKey({
			identity: track.command.identity,
		});
		const queue = queuesBySubject.get(subjectKey);
		if (!queue) return track.decideAlone();
		const { promise, resolve, reject } =
			Promise.withResolvers<DecidedMutation<never>>();
		queue.waiting.push({ ...track, kind: "solo", resolve, reject });
		return promise;
	}

	function whenDecided({
		identity,
	}: {
		identity: MeteringIdentity;
	}): Promise<void> | null {
		const queues = queuesByCustomer.get(
			meteringIdentityToPartitionKey({ identity }),
		);
		if (!queues || queues.size === 0) return null;
		const turns = [...queues].map((queue) => {
			const { promise, resolve } = Promise.withResolvers<void>();
			queue.waiting.push({ kind: "turn", resolve });
			return promise;
		});
		return Promise.all(turns).then(() => undefined);
	}

	/** Until the subject has nothing waiting: whatever arrives while a turn is decided waits behind it. */
	async function drain({
		queue,
		forget,
	}: {
		queue: SubjectQueue;
		forget(): void;
	}): Promise<void> {
		try {
			while (queue.waiting.length > 0)
				await decideInOrder({ tracks: queue.waiting.splice(0) });
		} catch (cause) {
			for (const waiting of queue.waiting.splice(0))
				if (waiting.kind === "turn") waiting.resolve();
				else waiting.reject(cause);
		} finally {
			// No await since the queue was last seen empty, so nothing can join it once it is forgotten.
			forget();
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
			if (track.kind === "turn") {
				track.resolve();
				start++;
				continue;
			}
			if (track.kind === "solo") {
				await decideAlone({ track });
				start++;
				continue;
			}
			const run: SyncTrackWaiting[] = [];
			for (let end = start; end < tracks.length; end++) {
				const candidate = tracks[end];
				if (candidate?.kind !== "sync") break;
				run.push(candidate);
			}
			await decideRun({ run });
			start += run.length;
		}
	}

	async function decideAlone({
		track,
	}: {
		track: Exclude<WaitingTrack, { kind: "turn" }>;
	}): Promise<void> {
		let decided: DecidedMutation<never>;
		try {
			decided = await track.decideAlone();
		} catch (cause) {
			track.reject(cause);
			return;
		}
		if (track.kind === "solo") track.resolve(decided);
		else answerWhenCommitted({ track, decided, runState: null });
	}

	async function decideRun({
		run,
	}: {
		run: SyncTrackWaiting[];
	}): Promise<void> {
		const [first] = run;
		if (!first) return;
		counters.trackRuns++;
		counters.trackRunTracks += run.length;
		counters.trackRunMax = Math.max(counters.trackRunMax, run.length);
		const { identity } = first.command;
		try {
			await ensureSubjectCurrent({ scope, command: first.command });
		} catch {
			// Each track hears its own failure the way a lone track would.
			for (const track of run) await decideAlone({ track });
			return;
		}
		const decidable = decidableLength({ identity, run });
		const outcomes =
			decidable === 0
				? []
				: scope.ctx.writer.decideRun({
						identity,
						submissions: run
							.slice(0, decidable)
							.map((track) => track.submission),
						stopsRun: isGoneMidRequest,
					});
		const runState = scope.ctx.writer.readFreshestState({ identity });
		for (const [index, track] of run.entries()) {
			const outcome = outcomes[index];
			if (outcome?.kind === "decided")
				answerWhenCommitted({ track, decided: outcome.decided, runState });
			else if (outcome?.kind === "failed") track.reject(outcome.cause);
			else await decideAlone({ track });
		}
	}

	/** Each reply as its own record commits: a lock track in the run waits for the store alone. */
	function answerWhenCommitted({
		track,
		decided,
		runState,
	}: {
		track: SyncTrackWaiting;
		decided: DecidedMutation<never>;
		runState: SubjectState | null;
	}): void {
		decided.waitForCommit().then((committed) => {
			try {
				track.resolve(
					track.answer({ committed: committed as CommittedMutation, runState }),
				);
			} catch (cause) {
				track.reject(cause);
			}
		}, track.reject);
	}

	/** How many tracks from the front decide on the ensured rows: a later one whose cycle has ended needs its reset first. */
	function decidableLength({
		identity,
		run,
	}: {
		identity: MeteringIdentity;
		run: SyncTrackWaiting[];
	}): number {
		const state = scope.ctx.writer.readFreshestState({ identity });
		if (!state) return 0;
		for (let index = 1; index < run.length; index++) {
			const asOf = run[index]?.command.occurredAt;
			if (asOf === undefined || resetMayBeDue({ state, asOf })) return index;
		}
		return run.length;
	}

	function readCounters(): TrackRunCounters {
		return { ...counters };
	}

	return { track, decideInTurn, whenDecided, readCounters };
};

type SyncTrackWaiting = Extract<WaitingTrack, { kind: "sync" }>;
