import {
	applyMutation,
	computeInitialize,
	type InitializeRequest,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { InitializeReply } from "@autumn/balance-worker-client/protocol";
import type { CatalogCache } from "@autumn/catalog-lru";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { MutationResult } from "../writer/types/mutation.js";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";

export type InitializeSubjectContext = {
	writer: Pick<PartitionWriter, "decide">;
	catalogCache: CatalogCache;
};

const alreadyInitialized = ({
	state,
	request,
}: {
	state: SubjectState | null;
	request: InitializeRequest;
}): boolean => {
	if (!state) return false;
	const { entityId } = request.command.identity;
	if (!entityId) return true;
	return state.entity?.id === entityId;
};

/** Runs inside the writer's critical section: no await, no I/O. */
const decideInitialize = ({
	state,
	request,
}: {
	state: SubjectState | null;
	request: InitializeRequest;
}): MutationResult<InitializeReply> => {
	if (state && alreadyInitialized({ state, request })) {
		return {
			kind: "reply",
			reply: {
				result: { status: "already_initialized", duplicate: false },
				state,
			},
		};
	}
	const { command } = request;
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
		state: request.state,
		revisionBefore: state?.revision ?? 0,
	});
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
};

/** The baseline for a subject, whoever supplied the rows: the server's initialize request or the worker's own hydration. */
export const initializeSubject = async ({
	ctx,
	request,
}: {
	ctx: InitializeSubjectContext;
	request: InitializeRequest;
}): Promise<InitializeReply> => {
	ctx.catalogCache.put({ rows: request.catalogRows });

	const decided = ctx.writer.decide<InitializeReply>({
		command: request.command,
		baseline: request.state,
		mutate: ({ state }) => decideInitialize({ state, request }),
	});

	const committed = await decided.waitForCommit();
	if ("mutation" in committed) {
		return {
			result: {
				status: "initialized",
				duplicate: committed.kind === "duplicate",
			},
			state: committed.state,
		};
	}
	return committed;
};
