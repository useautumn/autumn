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
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	DecidedMutation,
	MutationResult,
} from "../writer/types/mutation.js";

/** An Atom's finalize, queued: settled from Autumn's own row in arrival order, serialized by the partition writer as a finalize is. */
export async function decideAtomFinalize({
	scope,
	command,
	lock,
}: {
	scope: PartitionProcessorScope;
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): Promise<DecidedMutation<never>> {
	// Every outcome shares the journal entry's fingerprint, so a resend is a duplicate whichever way the first one went.
	const journalEntry = atomFinalizeToTrackOfNothing({ command });
	return withResidentSubject({
		customerKey: meteringIdentityToPartitionKey({ identity: command.identity }),
		ensure: () => ensureSubjectCurrent({ scope, command: journalEntry }),
		attempt: () =>
			scope.ctx.writer.decide<never>({
				command: journalEntry,
				mutate: ({ state }) =>
					timeSync({ label: "atomFinalize.decide" }, () =>
						mutateAtomFinalize({ scope, state, command, lock }),
					),
			}),
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
