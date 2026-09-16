import {
	applyMutation,
	type CustomerState,
	computeTrack,
	meteringPartitionKeyOf,
	parseTrackCommand,
	type TrackCommand,
	type TrackDecision,
	trackCommandFingerprintOf,
} from "@autumn/balance-engine";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

export type TrackReceiptPolicy = {
	retentionMs: number;
	now: () => number;
};

/** Decide now, reply once committed. */
export async function track({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): Promise<TrackDecision> {
	const { ctx } = scope;
	const parsed = parseTrackCommand({ input: command });
	const customerKey = meteringPartitionKeyOf({ identity: parsed.identity });
	const deduplicationExpiresAt =
		ctx.trackReceiptPolicy.now() + ctx.trackReceiptPolicy.retentionMs;

	// Synchronous: `mutate` runs against the freshest state and the mutation is enqueued before this returns.
	const decided = ctx.writer.decide<TrackDecision>({
		identity: parsed.identity,
		commandId: parsed.commandId,
		fingerprint: trackCommandFingerprintOf({ command: parsed }),
		mutate: ({ state }) =>
			decideTrack({
				state,
				customerKey,
				command: parsed,
				deduplicationExpiresAt,
			}),
	});

	// Asynchronous: Kafka commit, then SQLite apply.
	return await decided.waitForCommit();
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideTrack({
	state,
	customerKey,
	command,
	deduplicationExpiresAt,
}: {
	state: CustomerState | null;
	customerKey: string;
	command: TrackCommand;
	deduplicationExpiresAt: number;
}): MutationResult<TrackDecision> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });

	const decision = computeTrack({ state, command, deduplicationExpiresAt });
	if (decision.kind !== "new") return { kind: "reply", reply: decision };

	const { mutation } = decision;
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
