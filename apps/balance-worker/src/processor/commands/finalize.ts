import {
	applyMutation,
	type Catalog,
	deductFinalize,
	type FinalizeCommand,
	finalizeOutcomeToMutation,
	meteringIdentityToPartitionKey,
	parseFinalizeCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import type { FinalizeReply } from "@autumn/balance-worker-client/protocol";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

/** Decide now, reply once committed: the same path a track takes. */
export async function finalize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FinalizeCommand;
}): Promise<FinalizeReply> {
	const { ctx } = scope;
	const parsed = parseFinalizeCommand({ input: command });
	const customerKey = meteringIdentityToPartitionKey({
		identity: parsed.identity,
	});
	await ensureSubjectCurrent({ scope, command: parsed });

	// Filled by the decision, which is the only place that knows which rows it was made against.
	const decidedAgainst: { catalog?: Catalog } = {};
	const decided = ctx.writer.decide<never>({
		command: parsed,
		mutate: ({ state }) =>
			decideFinalize({
				scope,
				state,
				customerKey,
				command: parsed,
				decidedAgainst,
			}),
	});

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
			decidedAgainst.catalog ?? ctx.subjectHydrator.readCatalog({ state }),
	};
}

/** Runs inside the writer's critical section: the open-lock check and the settlement are one step. */
function decideFinalize({
	scope,
	state,
	customerKey,
	command,
	decidedAgainst,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	decidedAgainst: { catalog?: Catalog };
	command: FinalizeCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	decidedAgainst.catalog = scope.ctx.subjectHydrator.readCatalog({ state });

	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const deduction = deductFinalize({ fullSubject, command });
	const mutation = finalizeOutcomeToMutation({
		command,
		outcome: deduction,
		fullSubject,
	});
	const nextState = applyMutation({ state, mutation });
	const after = scope.ctx.subjectHydrator.readSubject({
		state: nextState,
		identity: command.identity,
	});
	return {
		kind: "write",
		mutation,
		nextState,
		effects: decideEffects({
			mutation,
			before: fullSubject,
			after,
			deduction,
		}),
	};
}
