import {
	applyMutation,
	computeTrack,
	meteringIdentityToPartitionKey,
	parseTrackCommand,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

/** Decide now, reply once committed. */
export async function track({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): Promise<TrackReply> {
	const { ctx } = scope;
	const parsed = parseTrackCommand({ input: command });
	const customerKey = meteringIdentityToPartitionKey({
		identity: parsed.identity,
	});
	await ctx.subjectHydrator.ensure({ identity: parsed.identity });

	// Synchronous: `mutate` runs against the freshest state and the mutation is enqueued before this returns.
	const decided = ctx.writer.decide<never>({
		command: parsed,
		mutate: ({ state }) =>
			decideTrack({ scope, state, customerKey, command: parsed }),
	});

	// Asynchronous: Kafka commit, then SQLite apply.
	const { mutation, state } = await decided.waitForCommit();
	if (mutation.result.type !== "track") {
		throw new Error(`Track ${mutation.id} committed a non-track record`);
	}
	return { result: mutation.result, changes: mutation.changes, state };
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideTrack({
	scope,
	state,
	customerKey,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	command: TrackCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });

	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const mutation = computeTrack({ fullSubject, command });
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
