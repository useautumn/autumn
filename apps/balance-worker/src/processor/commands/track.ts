import {
	applyMutation,
	type Catalog,
	computeTrackDecision,
	type MutationEffect,
	meteringIdentityToPartitionKey,
	type SubjectState,
	slimSubjectForFeatures,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { withResidentSubject } from "../actions/withResidentSubject.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationResult,
} from "../writer/types/mutation.js";

/** Every track, sync or queued, deducts here: serialized by the partition writer. */
export async function decideTrack({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): Promise<DecidedTrack> {
	const { ctx } = scope;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	// Filled by the decision, the only place that knows its rows and effects; a retry never runs it.
	const decidedAgainst: DecidedAgainst = {};
	// Synchronous once ensured: `mutate` runs against the freshest state and the mutation is enqueued before it returns.
	const decided = await withResidentSubject({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () =>
			ctx.writer.decide<never>({
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
						}),
					),
			}),
	});
	return { ...decided, decidedAgainst };
}

/** Sync: decide, then answer once the deduction is committed. */
export async function track({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): Promise<TrackReply> {
	const decided = await decideTrack({ scope, command });
	const committed = await decided.waitForCommit();
	return toTrackReply({
		scope,
		command,
		committed,
		decidedAgainst: decided.decidedAgainst,
	});
}

export function toTrackReply({
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
		...slimSubjectForFeatures({
			state,
			catalog,
			featureIds: [command.featureId],
		}),
		effects: decidedAgainst.effects ?? [],
	};
}

export type DecidedAgainst = {
	catalog?: Catalog;
	effects?: MutationEffect[];
};

/** The deduction, enqueued in order; what it was decided against shapes the sync reply. */
type DecidedTrack = DecidedMutation<never> & { decidedAgainst: DecidedAgainst };

/** Runs inside the writer's critical section: no await, no I/O. */
export function mutateTrack({
	scope,
	state,
	customerKey,
	command,
	decidedAgainst,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	decidedAgainst: DecidedAgainst;
	command: TrackCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	// One catalog read serves both views: the rows a mutation adds reference catalog the state already held.
	const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
	decidedAgainst.catalog = catalog;

	const fullSubject = scope.ctx.subjectHydrator.readSubjectWith({
		state,
		catalog,
		identity: command.identity,
	});
	const decision = computeTrackDecision({ fullSubject, command });
	const { mutation } = decision;
	const nextState = applyMutation({ state, mutation });
	const after = scope.ctx.subjectHydrator.readSubjectWith({
		state: nextState,
		catalog,
		identity: command.identity,
	});
	const effects = decideEffects({ decision, before: fullSubject, after });
	decidedAgainst.effects = effects;
	return { kind: "write", mutation, nextState, effects };
}
