import {
	type AtomFinalizeCommand,
	applyMutation,
	atomFinalizeToTrackOfNothing,
	computeAtomFinalizeDecision,
	meteringIdentityToPartitionKey,
	type SubjectState,
	type WorkerLock,
} from "@autumn/balance-engine";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { withResidentSubject } from "../actions/withResidentSubject.js";
import {
	LockFeatureNotLoadedError,
	PartitionProcessorStateNotFoundError,
} from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	DecidedMutation,
	MutationResult,
} from "../writer/types/mutation.js";

/** A finalize the Atom left undecided names no feature: the row's, with the internal id the subject's catalog holds for it, as the API names one. */
function resolveLockFeature({
	scope,
	command,
	lock,
}: {
	scope: PartitionProcessorScope;
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): AtomFinalizeCommand {
	if (command.internalFeatureId !== null || !lock) return command;
	const state = scope.ctx.writer.readFreshestState({
		identity: command.identity,
	});
	const feature =
		state &&
		Object.values(
			scope.ctx.subjectHydrator.readCatalog({ state }).features,
		).find((candidate) => candidate.id === lock.feature_id);
	if (!feature)
		throw new LockFeatureNotLoadedError({
			lockId: command.lockId,
			featureId: lock.feature_id,
		});
	return { ...command, internalFeatureId: feature.internal_id };
}

/** An Atom's finalize, queued: settled from Autumn's own row in arrival order, serialized by the partition writer as a finalize is. */
export async function decideAtomFinalize({
	scope,
	command: handedIn,
	lock,
}: {
	scope: PartitionProcessorScope;
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): Promise<DecidedMutation<never>> {
	return withResidentSubject({
		customerKey: meteringIdentityToPartitionKey({
			identity: handedIn.identity,
		}),
		ensure: () => ensureSubjectCurrent({ scope, command: handedIn }),
		attempt: () => {
			const command = resolveLockFeature({ scope, command: handedIn, lock });
			// Every outcome shares the journal entry's fingerprint, so a resend is a duplicate whichever way the first one went.
			const journalEntry = atomFinalizeToTrackOfNothing({ command, lock });
			return scope.ctx.writer.decide<never>({
				command: journalEntry,
				mutate: ({ state }) =>
					timeSync({ label: "atomFinalize.decide" }, () =>
						mutateAtomFinalize({ scope, state, command, lock }),
					),
			});
		},
	});
}

/** Runs inside the writer's critical section: whether the lock is still open and the settlement are one step. */
function mutateAtomFinalize({
	scope,
	state,
	command,
	lock,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): MutationResult<never> {
	if (!state)
		throw new PartitionProcessorStateNotFoundError({
			customerKey: meteringIdentityToPartitionKey({
				identity: command.identity,
			}),
		});
	const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
	const fullSubject = scope.ctx.subjectHydrator.readSubjectWith({
		state,
		catalog,
		identity: command.identity,
	});
	const decision = computeAtomFinalizeDecision({ fullSubject, command, lock });
	const nextState = applyMutation({ state, mutation: decision.mutation });
	const after = scope.ctx.subjectHydrator.readSubjectWith({
		state: nextState,
		catalog,
		identity: command.identity,
	});
	return {
		kind: "write",
		mutation: decision.mutation,
		nextState,
		effects: decideEffects({ decision, before: fullSubject, after }),
	};
}
