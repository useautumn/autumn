import {
	type CheckCommand,
	computeCheck,
	meteringIdentityToPartitionKey,
	parseCheckCommand,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** Wait for the deductions already in flight for this customer, then read committed state. */
export async function check({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): Promise<CheckReply> {
	const { ctx } = scope;
	const parsed = parseCheckCommand({ input: command });
	const customerKey = meteringIdentityToPartitionKey({
		identity: parsed.identity,
	});
	await ensureSubjectCurrent({ scope, command: parsed });

	// Only outcomes pending at this moment, any reset just decided included; a track arriving later is not "earlier" for this check.
	await ctx.writer.waitForPendingCommits({ customerKey });
	ctx.assertCanRead();

	const state = ctx.writer.readFreshestState({ identity: parsed.identity });
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	const fullSubject = ctx.subjectHydrator.readSubject({
		state,
		identity: parsed.identity,
	});
	return {
		result: computeCheck({ fullSubject, command: parsed }),
		state,
		catalog: ctx.subjectHydrator.readCatalog({ state }),
	};
}
