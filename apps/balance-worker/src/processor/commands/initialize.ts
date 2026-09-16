import {
	applyMutation,
	type CustomerState,
	type CustomerStateMutation,
	computeInitialize,
	type InitializationDecision,
	type InitializeCommand,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

/** Initialize, end to end: commit a revision-zero baseline unless the customer already has state. */
export async function initialize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: InitializeCommand;
}): Promise<InitializationDecision> {
	const { ctx } = scope;
	const parsed = parseInitializeCommand({ input: command });
	const deduplicationExpiresAt =
		ctx.trackReceiptPolicy.now() + ctx.trackReceiptPolicy.retentionMs;
	// The baseline does not depend on current state, so it is built outside the critical section.
	const mutation = computeInitialize({
		command: parsed,
		deduplicationExpiresAt,
	});

	const decided = ctx.writer.decide<InitializationDecision>({
		identity: parsed.identity,
		commandId: parsed.commandId,
		fingerprint: mutation.receipt.fingerprint,
		mutate: ({ state }) => decideInitialize({ state, mutation }),
	});

	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) return committed;
	return {
		kind: committed.kind === "new" ? "initialized" : "duplicate",
		state: applyMutation({ state: null, mutation: committed.mutation }),
	};
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideInitialize({
	state,
	mutation,
}: {
	state: CustomerState | null;
	mutation: CustomerStateMutation;
}): MutationResult<InitializationDecision> {
	if (state) return { kind: "reply", reply: { kind: "already_initialized" } };

	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state: null, mutation }),
	};
}
