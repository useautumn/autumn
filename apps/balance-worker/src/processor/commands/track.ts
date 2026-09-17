import {
	applyMutation,
	computeTrack,
	meteringPartitionKeyOf,
	parseTrackCommand,
	type SubjectState,
	type TrackCommand,
	type TrackDecision,
	trackCommandFingerprintOf,
} from "@autumn/balance-engine";
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
}): Promise<TrackDecision> {
	const { ctx } = scope;
	const parsed = parseTrackCommand({ input: command });
	const customerKey = meteringPartitionKeyOf({ identity: parsed.identity });
	const deduplicationExpiresAt =
		ctx.receiptPolicy.now() + ctx.receiptPolicy.retentionMs;
	await ctx.subjectHydrator.ensure({ identity: parsed.identity });

	// Synchronous: `mutate` runs against the freshest state and the mutation is enqueued before this returns.
	const decided = ctx.writer.decide<TrackDecision>({
		identity: parsed.identity,
		commandId: parsed.commandId,
		fingerprint: trackCommandFingerprintOf({ command: parsed }),
		mutate: ({ state }) =>
			decideTrack({
				scope,
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
	scope,
	state,
	customerKey,
	command,
	deduplicationExpiresAt,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	command: TrackCommand;
	deduplicationExpiresAt: number;
}): MutationResult<TrackDecision> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });

	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const decision = computeTrack({
		fullSubject,
		command,
		deduplicationExpiresAt,
	});
	if (decision.kind !== "new") return { kind: "reply", reply: decision };

	const { mutation } = decision;
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
