import {
	applyMutation,
	type Catalog,
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
	// Filled by the decision, which is the only place that knows which rows it was made against.
	const decidedAgainst: { catalog?: Catalog } = {};
	const decided = ctx.writer.decide<never>({
		command: parsed,
		mutate: ({ state }) =>
			decideTrack({
				scope,
				state,
				customerKey,
				command: parsed,
				decidedAgainst,
			}),
	});

	// Asynchronous: Kafka commit, then SQLite apply.
	const { mutation, state } = await decided.waitForCommit();
	if (mutation.result.type !== "track") {
		throw new Error(`Track ${mutation.id} committed a non-track record`);
	}
	return {
		result: mutation.result,
		changes: mutation.changes,
		state,
		// A duplicate or joined command never ran the decision, so it reads the committed state's catalog.
		catalog:
			decidedAgainst.catalog ?? ctx.subjectHydrator.readCatalog({ state }),
	};
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideTrack({
	scope,
	state,
	customerKey,
	command,
	decidedAgainst,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	decidedAgainst: { catalog?: Catalog };
	command: TrackCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	decidedAgainst.catalog = scope.ctx.subjectHydrator.readCatalog({ state });

	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const mutation = computeTrack({ fullSubject, command });
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
		catalog: decidedAgainst.catalog,
	};
}
