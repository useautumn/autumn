import {
	applyMutation,
	type Catalog,
	computeFinalizeDecision,
	type FinalizeCommand,
	meteringIdentityToPartitionKey,
	parseFinalizeCommand,
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

/** The settlement, enqueued in order; the catalog it was decided against shapes the sync reply. */
type DecidedFinalize = DecidedMutation<never> & {
	decidedAgainst: DecidedAgainst;
};

/** Every finalize, sync or queued, settles its lock here: serialized by the partition writer, the same path a track takes. */
export async function decideFinalize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FinalizeCommand;
}): Promise<DecidedFinalize> {
	const { ctx } = scope;
	const parsed = parseFinalizeCommand({ input: command });
	const customerKey = meteringIdentityToPartitionKey({
		identity: parsed.identity,
	});
	// Filled by the decision, which is the only place that knows which rows it was made against.
	const decidedAgainst: DecidedAgainst = {};
	const decided = await withResidentSubject({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command: parsed }),
		attempt: () =>
			ctx.writer.decide<never>({
				command: parsed,
				mutate: ({ state }) =>
					timeSync({ label: "finalize.decide" }, () =>
						mutateFinalize({
							scope,
							state,
							customerKey,
							command: parsed,
							decidedAgainst,
						}),
					),
			}),
	});
	return { ...decided, decidedAgainst };
}

/** Sync: decide, then answer once the settlement is committed. */
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
		// A duplicate or joined command never ran the decision, so it reads the committed state's catalog.
		catalog:
			decided.decidedAgainst.catalog ??
			scope.ctx.subjectHydrator.readCatalog({ state }),
	};
}

/** Runs inside the writer's critical section: the open-lock check and the settlement are one step. */
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
	// One catalog read serves both views: the rows a mutation adds reference catalog the state already held.
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
