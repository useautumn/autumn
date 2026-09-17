import {
	applyMutation,
	computeInitialize,
	type InitializationDecision,
	type InitializeCommand,
	initializeCommandToFingerprint,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { CatalogCache } from "../../catalog/types/catalogCache.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { ReceiptPolicy } from "../types/receiptPolicy.js";
import type {
	CommittedMutation,
	MutationResult,
} from "../writer/types/mutation.js";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";

export type InitializeSubjectContext = {
	writer: Pick<PartitionWriter, "decide" | "readFreshestState">;
	catalogCache: CatalogCache;
	receiptPolicy: ReceiptPolicy;
};

const alreadyInitialized = ({
	state,
	command,
}: {
	state: SubjectState | null;
	command: InitializeCommand;
}): boolean => {
	if (!state) return false;
	const { entityId } = command.identity;
	if (!entityId) return true;
	return state.entity?.id === entityId;
};

/** Runs inside the writer's critical section: no await, no I/O. */
const decideInitialize = ({
	state,
	command,
	deduplicationExpiresAt,
}: {
	state: SubjectState | null;
	command: InitializeCommand;
	deduplicationExpiresAt: number;
}): MutationResult<InitializationDecision> => {
	if (alreadyInitialized({ state, command })) {
		return { kind: "reply", reply: { kind: "already_initialized" } };
	}
	// An entity joins its customer's log, so the customer must already be there.
	if (command.identity.entityId && !state) {
		throw new PartitionProcessorStateNotFoundError({
			customerKey: meteringIdentityToPartitionKey({
				identity: command.identity,
			}),
		});
	}
	const mutation = computeInitialize({
		command,
		revisionBefore: state?.revision ?? 0,
		deduplicationExpiresAt,
	});
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
};

/** The baseline for a subject, whoever supplied the rows: the server's initialize command or the worker's own hydration. */
export const initializeSubject = async ({
	ctx,
	command,
}: {
	ctx: InitializeSubjectContext;
	command: InitializeCommand;
}): Promise<InitializationDecision> => {
	ctx.catalogCache.put({ rows: command.catalogRows });
	const deduplicationExpiresAt =
		ctx.receiptPolicy.now() + ctx.receiptPolicy.retentionMs;

	let initializedState: SubjectState | null = null;
	const decided = ctx.writer.decide<InitializationDecision>({
		identity: command.identity,
		commandId: command.commandId,
		fingerprint: initializeCommandToFingerprint({ command }),
		mutate: ({ state }) => {
			const result = decideInitialize({
				state,
				command,
				deduplicationExpiresAt,
			});
			if (result.kind === "write") initializedState = result.nextState;
			return result;
		},
	});

	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) return committed;
	if (committed.kind === "new" && initializedState) {
		return { kind: "initialized", state: initializedState };
	}
	return { kind: "duplicate", state: stateAfter({ ctx, committed }) };
};

/** The baseline a retry sees: a customer initialize rebuilds from its inserts, an entity one reads the view it joined. */
const stateAfter = ({
	ctx,
	committed,
}: {
	ctx: InitializeSubjectContext;
	committed: CommittedMutation;
}): SubjectState => {
	const { mutation } = committed;
	if (mutation.identity.entityId === null) {
		return applyMutation({ state: null, mutation });
	}
	const state = ctx.writer.readFreshestState({ identity: mutation.identity });
	if (!state) {
		throw new PartitionProcessorStateNotFoundError({
			customerKey: meteringIdentityToPartitionKey({
				identity: mutation.identity,
			}),
		});
	}
	return state;
};
