import {
	applyMutation,
	type Catalog,
	computeTrackDecision,
	type DeductionDecision,
	type MutationEffect,
	meteringIdentityToPartitionKey,
	type SubjectState,
	type TrackCommand,
	trackCommandToDeductionRequest,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type {
	TrackGrant,
	TrackReply,
} from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { withResidentSubject } from "../actions/withResidentSubject.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
import { shouldDecideEffects } from "../effects/shouldDecideEffects.js";
import { slimReplySubject } from "../replies/slimReplySubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationResult,
	MutationSubmission,
} from "../writer/types/mutation.js";

/** What the writer decides for a track: the deduction against the freshest state, recording what it read. */
function trackSubmissionOf({
	scope,
	command,
	customerKey,
	decidedAgainst,
	grantLane,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	customerKey: string;
	decidedAgainst: DecidedAgainst;
	grantLane?: string;
}): MutationSubmission<never> {
	return {
		command,
		// A finalize finds its lock by reading Postgres, so the caller hears of a lock only once its row is there.
		durability: command.lock ? "store" : "log",
		mutate: ({ state }) =>
			timeSync({ label: "track.decide" }, () =>
				mutateTrack({
					scope,
					state,
					customerKey,
					command,
					decidedAgainst,
					grantLane,
				}),
			),
	};
}

/** A lone track: ensured, then decided synchronously against the freshest state, retried once if its rows left. */
function decideTrackAlone({
	scope,
	command,
	customerKey,
	submission,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	customerKey: string;
	submission: MutationSubmission<never>;
}): Promise<DecidedMutation<never>> {
	return withResidentSubject({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () => scope.ctx.writer.decide<never>(submission),
	});
}

/** A track's submission and lone decision, built once: a retry or a run never rebuilds them. */
export function trackDecisionOf({
	scope,
	command,
	grantLane,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	grantLane?: string;
}) {
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	// Filled by the decision, the only place that knows its rows and effects; a retry never runs it.
	const decidedAgainst: DecidedAgainst = {};
	const submission = trackSubmissionOf({
		scope,
		command,
		customerKey,
		decidedAgainst,
		grantLane,
	});
	function decideAlone(): Promise<DecidedMutation<never>> {
		return decideTrackAlone({ scope, command, customerKey, submission });
	}
	return { decidedAgainst, submission, decideAlone };
}

/** Every queued track deducts here, in its subject's turn: serialized by the partition writer. */
export async function decideTrack({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): Promise<DecidedTrack> {
	const { decidedAgainst, submission, decideAlone } = trackDecisionOf({
		scope,
		command,
	});
	const decided = scope.trackRuns
		? await scope.trackRuns.decideInTurn({ command, submission, decideAlone })
		: await decideAlone();
	return { ...decided, decidedAgainst };
}

/** Sync: decided in its subject's run, answered once the deduction is committed. */
export async function track({
	scope,
	command,
	grantLane,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	grantLane?: string;
}): Promise<TrackReply> {
	const { decidedAgainst, submission, decideAlone } = trackDecisionOf({
		scope,
		command,
		grantLane,
	});
	function answer({
		committed,
		runState,
	}: {
		committed: CommittedMutation;
		runState: SubjectState | null;
	}): TrackReply {
		const sharesRunSnapshot =
			scope.ctx.config.sharesRunSnapshot === true && runState !== null;
		return toTrackReply({
			scope,
			command,
			committed: sharesRunSnapshot
				? { ...committed, state: runState }
				: committed,
			decidedAgainst,
		});
	}
	if (scope.trackRuns)
		return scope.trackRuns.track({ command, submission, decideAlone, answer });
	const decided = await decideAlone();
	return answer({
		committed: (await decided.waitForCommit()) as CommittedMutation,
		runState: null,
	});
}

function toTrackReply({
	scope,
	command,
	committed,
	decidedAgainst,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	committed: CommittedMutation;
	decidedAgainst: DecidedAgainst;
}): TrackReply {
	const { mutation, state } = committed;
	if (mutation.result.type !== "track") {
		throw new Error(`Track ${mutation.id} committed a non-track record`);
	}
	// A duplicate or joined command never ran the decision, so it reads the committed state's catalog.
	const catalog =
		decidedAgainst.catalog ?? scope.ctx.subjectHydrator.readCatalog({ state });
	// The caller reports this feature's balance, so the reply carries the rows that fund it, not the whole customer.
	return {
		result: mutation.result,
		changes: mutation.changes,
		...slimReplySubject({
			state,
			catalog,
			featureId: command.featureId,
		}),
		effects: decidedAgainst.effects ?? [],
		...(decidedAgainst.grant ? { grant: decidedAgainst.grant } : {}),
	};
}

type DecidedAgainst = {
	catalog?: Catalog;
	effects?: MutationEffect[];
	grant?: TrackGrant;
};

/** The deduction, enqueued in order; what it was decided against shapes the sync reply. */
type DecidedTrack = DecidedMutation<never> & { decidedAgainst: DecidedAgainst };

/** Runs inside the writer's critical section: no await, no I/O. */
function mutateTrack({
	scope,
	state,
	customerKey,
	command,
	decidedAgainst,
	grantLane,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	decidedAgainst: DecidedAgainst;
	command: TrackCommand;
	grantLane?: string;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	// One catalog read serves both views: the rows a mutation adds reference catalog the state already held.
	const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
	decidedAgainst.catalog = catalog;
	const readView = (viewed: SubjectState) =>
		scope.ctx.subjectHydrator.readSubjectWith({
			state: viewed,
			catalog,
			identity: command.identity,
		});

	const { decision, alwaysDecidesEffects } =
		scope.ctx.config.carriesTrackContexts === false
			? {
					decision: computeTrackDecision({
						fullSubject: readView(state),
						command,
					}),
					alwaysDecidesEffects: true,
				}
			: decideOnCarriedContext({
					scope,
					state,
					catalog,
					command,
					readView,
					customerKey,
					grantLane,
					decidedAgainst,
				});
	const { mutation } = decision;
	scope.ctx.subjectDecisions.recordDraws({
		changes: mutation.changes,
		at: command.occurredAt,
	});
	const nextState = applyMutation({ state, mutation });
	const decidesEffects = shouldDecideEffects({
		command,
		decision,
		alwaysDecides: alwaysDecidesEffects,
	});
	scope.ctx.subjectDecisions.countEffects({ decided: decidesEffects });
	const effects = decidesEffects
		? decideEffects({
				decision,
				before: readView(state),
				after: readView(nextState),
			})
		: [];
	decidedAgainst.effects = effects;
	return { kind: "write", mutation, nextState, effects };
}

/** The run's carried context and base view, at this state's revision: equal to deciding on a fresh view of `state`. */
function decideOnCarriedContext({
	scope,
	state,
	catalog,
	command,
	readView,
	customerKey,
	grantLane,
	decidedAgainst,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState;
	catalog: Catalog;
	command: TrackCommand;
	readView: (viewed: SubjectState) => WorkerFullSubject;
	customerKey: string;
	grantLane?: string;
	decidedAgainst: DecidedAgainst;
}): { decision: DeductionDecision; alwaysDecidesEffects: boolean } {
	const { subjectDecisions } = scope.ctx;
	const carried = subjectDecisions.readTrackDecision({
		state,
		identity: command.identity,
		request: trackCommandToDeductionRequest({ command }),
		catalog,
		join: () => readView(state),
	});
	const grantsTracks = scope.ctx.config.grantsTracks === true;
	const decision = computeTrackDecision({
		fullSubject: carried.fullSubject,
		command,
		// Units granted to the servers are spoken for: no other decision may draw them.
		context: grantsTracks
			? subjectDecisions.reserveTrackGrants({
					customerKey,
					command,
					context: carried.context,
				})
			: carried.context,
		revision: state.revision,
	});
	if (
		grantsTracks &&
		grantLane !== undefined &&
		decision.mutation.result.type === "track" &&
		decision.mutation.result.status === "applied"
	) {
		const grant = subjectDecisions.grantTrack({
			customerKey,
			command,
			context: carried.context,
			deltas: decision.outcome.deltas,
			lane: grantLane,
		});
		if (grant) decidedAgainst.grant = grant;
	}
	return { decision, alwaysDecidesEffects: carried.alwaysDecidesEffects };
}
