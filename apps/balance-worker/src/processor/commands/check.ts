import {
	type CheckCommand,
	type CheckDecision,
	computeCheck,
	meteringPartitionKeyOf,
	parseCheckCommand,
} from "@autumn/balance-engine";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** Wait for the deductions already in flight for this customer, then read committed state. */
export async function check({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): Promise<CheckDecision> {
	const { ctx } = scope;
	const parsed = parseCheckCommand({ input: command });
	const customerKey = meteringPartitionKeyOf({ identity: parsed.identity });

	// Only outcomes pending at this moment; a track arriving later is not "earlier" for this check.
	await ctx.writer.waitForPendingCommits({ customerKey });
	ctx.assertCanRead();

	const state = ctx.stateStore.readState({ identity: parsed.identity });
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	return computeCheck({ state, command: parsed });
}
