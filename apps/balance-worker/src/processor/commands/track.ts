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

/** Track's meaning: decide against the freshest state, project the deduction, commit via the writer. */
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

	function mutateTrack(params: MutateParams): MutationResult<TrackDecision> {
		return decideTrack({ ...params, command, deduplicationExpiresAt });
	}

	const committed = await writer.submitMutation({
		submission: {
			identity: command.identity,
			commandId: command.commandId,
			fingerprint: trackCommandFingerprintOf({ command }),
			mutate: mutateTrack,
		},
	});
	return trackDecisionOf({ committed });
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

function trackDecisionOf({
	committed,
}: {
	committed: TrackDecision | CommittedMutation;
}): TrackDecision {
	if (!("outcome" in committed)) return committed;
	if (committed.outcome.type !== "track_outcome") {
		throw new Error("Track committed a non-track record");
	}
	return { kind: committed.kind, outcome: committed.outcome };
}
