import {
	applyMutation,
	computeInitialize,
	type InitializationDecision,
	type InitializeCommand,
	type SubjectState,
	type SubjectStateMutation,
} from "@autumn/balance-engine";
import type { CatalogCache } from "../../catalog/types/catalogCache.js";
import type { ReceiptPolicy } from "../types/receiptPolicy.js";
import type { MutationResult } from "../writer/types/mutation.js";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";

export type InitializeSubjectContext = {
	writer: Pick<PartitionWriter, "decide">;
	catalogCache: CatalogCache;
	receiptPolicy: ReceiptPolicy;
};

/** Runs inside the writer's critical section: no await, no I/O. */
const decideInitialize = ({
	state,
	mutation,
}: {
	state: SubjectState | null;
	mutation: SubjectStateMutation;
}): MutationResult<InitializationDecision> => {
	if (state) return { kind: "reply", reply: { kind: "already_initialized" } };
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state: null, mutation }),
	};
};

/** The revision-zero baseline, whoever supplied the rows: the server's initialize command or the worker's own hydration. */
export const initializeSubject = async ({
	ctx,
	command,
}: {
	ctx: InitializeSubjectContext;
	command: InitializeCommand;
}): Promise<InitializationDecision> => {
	ctx.catalogCache.put({ rows: command.catalogRows });
	// The baseline does not depend on current state, so it is built outside the critical section.
	const mutation = computeInitialize({
		command,
		deduplicationExpiresAt:
			ctx.receiptPolicy.now() + ctx.receiptPolicy.retentionMs,
	});

	const decided = ctx.writer.decide<InitializationDecision>({
		identity: command.identity,
		commandId: command.commandId,
		fingerprint: mutation.receipt.fingerprint,
		mutate: ({ state }) => decideInitialize({ state, mutation }),
	});

	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) return committed;
	return {
		kind: committed.kind === "new" ? "initialized" : "duplicate",
		state: applyMutation({ state: null, mutation: committed.mutation }),
	};
};
