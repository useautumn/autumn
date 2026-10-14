import {
	applyMutation,
	type Catalog,
	computeFinalizeDecision,
	type FinalizeCommand,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { FinalizeReply } from "@autumn/balance-worker-client/protocol";
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

type DecidedAgainst = { catalog?: Catalog };

type DecidedFinalize = DecidedMutation<never> & {
	decidedAgainst: DecidedAgainst;
};

export async function decideFinalize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FinalizeCommand;
}): Promise<DecidedFinalize> {
	const { ctx } = scope;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	const decidedAgainst: DecidedAgainst = {};
	const decided = await withResidentSubject({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () =>
			ctx.writer.decide<never>({
				command,
				mutate: ({ state }) =>
					timeSync({ label: "finalize.decide" }, () =>
						mutateFinalize({
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

export async function finalize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FinalizeCommand;
}): Promise<FinalizeReply> {
	const decided = await decideFinalize({ scope, command });
	const { mutation, state } = await decided.waitForCommit();
	if (mutation.result.type !== "finalize") {
		throw new Error(`Finalize ${mutation.id} committed a non-finalize record`);
	}
	return {
		result: mutation.result,
		changes: mutation.changes,
		state,
		catalog:
			decided.decidedAgainst.catalog ??
			scope.ctx.subjectHydrator.readCatalog({ state }),
	};
}

function mutateFinalize({
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
	command: FinalizeCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
	decidedAgainst.catalog = catalog;

	const fullSubject = scope.ctx.subjectHydrator.readSubjectWith({
		state,
		catalog,
		identity: command.identity,
	});
	const decision = computeFinalizeDecision({ fullSubject, command });
	const { mutation } = decision;
	const nextState = applyMutation({ state, mutation });
	const after = scope.ctx.subjectHydrator.readSubjectWith({
		state: nextState,
		catalog,
		identity: command.identity,
	});
	return {
		kind: "write",
		mutation,
		nextState,
		effects: decideEffects({ decision, before: fullSubject, after }),
	};
}
