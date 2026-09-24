import {
	applyMutation,
	type Catalog,
	computeTrack,
	meteringIdentityToPartitionKey,
	parseTrackCommand,
	type SubjectState,
	slimSubjectForFeatures,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
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
	await ensureSubjectCurrent({ scope, command: parsed });

	// Synchronous: `mutate` runs against the freshest state and the mutation is enqueued before this returns.
	// Filled by the decision, which is the only place that knows which rows it was made against.
	const decidedAgainst: { catalog?: Catalog } = {};
	const decided = ctx.writer.decide<never>({
		command: parsed,
		mutate: ({ state }) =>
			timeSync({ label: "track.decide" }, () =>
				decideTrack({
					scope,
					state,
					customerKey,
					command: parsed,
					decidedAgainst,
				}),
			),
	});

	// Asynchronous: Kafka commit, then SQLite apply.
	const { mutation, state } = await decided.waitForCommit();
	if (mutation.result.type !== "track") {
		throw new Error(`Track ${mutation.id} committed a non-track record`);
	}
	// A duplicate or joined command never ran the decision, so it reads the committed state's catalog.
	const catalog =
		decidedAgainst.catalog ?? ctx.subjectHydrator.readCatalog({ state });
	// The caller reports this feature's balance, so the reply carries the rows that fund it, not the whole customer.
	return {
		result: mutation.result,
		changes: mutation.changes,
		...slimSubjectForFeatures({
			state,
			catalog,
			featureIds: [parsed.featureId],
		}),
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
	const nextState = applyMutation({ state, mutation });
	const after = scope.ctx.subjectHydrator.readSubject({
		state: nextState,
		identity: command.identity,
	});
	return {
		kind: "write",
		mutation,
		nextState,
		effects: decideEffects({ mutation, before: fullSubject, after }),
	};
}
