import {
	computeTrack,
	executeTrack,
	type TrackCommand,
	type TrackDecision,
	trackCommandFingerprintOf,
} from "@autumn/balance-engine";
import type {
	CommittedMutation,
	MutateParams,
	MutationResult,
} from "../writer/types/mutation.js";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";

export type TrackReceiptPolicy = {
	retentionMs: number;
	now: () => number;
};

/** Decide now, reply once committed. */
export async function submitTrack({
	writer,
	command,
	receiptPolicy,
}: {
	writer: PartitionWriter;
	command: TrackCommand;
	receiptPolicy: TrackReceiptPolicy;
}): Promise<TrackDecision> {
	const deduplicationExpiresAt =
		receiptPolicy.now() + receiptPolicy.retentionMs;

	// Synchronous: `mutate` runs against the freshest state and the outcome is enqueued before this returns.
	const decided = writer.decide({
		identity: command.identity,
		commandId: command.commandId,
		fingerprint: trackCommandFingerprintOf({ command }),
		mutate: ({ state }) =>
			decideTrack({ state, command, deduplicationExpiresAt }),
	});

	// Asynchronous: Kafka commit, then SQLite apply.
	const committed = await decided.waitForCommit();
	if (!("outcome" in committed)) return committed;
	const { kind, outcome } = committed;
	return committedMutationToTrackDecision({ kind, outcome });
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideTrack({
	state,
	command,
	deduplicationExpiresAt,
}: MutateParams & {
	command: TrackCommand;
	deduplicationExpiresAt: number;
}): MutationResult<TrackDecision> {
	const decision = computeTrack({ state, command, deduplicationExpiresAt });
	if (decision.kind !== "new") return { kind: "reply", reply: decision };
	const { state: nextState } = executeTrack({
		state,
		outcome: decision.outcome,
	});
	return { kind: "write", outcome: decision.outcome, nextState };
}

function committedMutationToTrackDecision({
	kind,
	outcome,
}: CommittedMutation): TrackDecision {
	if (outcome.type !== "track_outcome") {
		throw new Error("Track committed a non-track record");
	}
	return { kind, outcome };
}
