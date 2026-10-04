import type {
	MutationSource,
	SubjectState,
	TrackCommand,
} from "@autumn/balance-engine";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { trackDecisionOf } from "../commands/track.js";
import { completeCommand } from "../execution/completeCommand.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { DecidedMutation } from "../writer/types/mutation.js";

/** A queued track with the command-topic offset its record carries. */
export type QueuedTrackEntry = {
	command: TrackCommand;
	source: MutationSource;
};

/** Decided in the run, or left for the caller to apply alone, in order, the way a lone record is. */
export type QueuedTrackOutcome =
	| { kind: "decided"; decided: DecidedMutation<never> }
	| { kind: "alone" };

/** How many entries from the front decide on the ensured rows: a later one whose cycle has ended needs its reset first. */
function decidableLength({
	state,
	entries,
}: {
	state: SubjectState;
	entries: QueuedTrackEntry[];
}): number {
	for (let index = 1; index < entries.length; index++) {
		const asOf = entries[index]?.command.occurredAt;
		if (asOf === undefined || resetMayBeDue({ state, asOf })) return index;
	}
	return entries.length;
}

/**
 * Consecutive queued tracks for one subject, decided as one run on the writer: ensured once, each record stamped
 * with its own offset, in offset order. Any failure stops the run; it and everything after go back to be applied
 * alone, so a failure is met exactly as it is on a lone record and no later offset passes it.
 */
export async function executeQueuedTrackRun({
	scope,
	entries,
}: {
	scope: PartitionProcessorScope;
	entries: QueuedTrackEntry[];
}): Promise<QueuedTrackOutcome[]> {
	const alone = (): QueuedTrackOutcome => ({ kind: "alone" });
	const [first] = entries;
	if (!first) return [];
	const { identity } = first.command;
	const turn = scope.trackRuns?.whenDecided({ identity });
	if (turn) await turn;
	try {
		await ensureSubjectCurrent({ scope, command: first.command });
	} catch {
		return entries.map(alone);
	}
	const state = scope.ctx.writer.readFreshestState({ identity });
	if (!state) return entries.map(alone);
	const decidable = entries.slice(0, decidableLength({ state, entries }));
	const outcomes = scope.ctx.writer.decideRun({
		identity,
		submissions: decidable.map(({ command, source }) => ({
			...trackDecisionOf({ scope, command }).submission,
			source,
		})),
		stopsRun: () => true,
	});
	const results = entries.map((_, index): QueuedTrackOutcome => {
		const outcome = outcomes[index];
		return outcome?.kind === "decided"
			? { kind: "decided", decided: outcome.decided }
			: alone();
	});
	await completeTrailingCommands({ scope, entries, results });
	return results;
}

/** A decided record that wrote nothing (a duplicate) has no record to carry its offset; a later write's does,
 *  and past the last write the bookmark lands the way a lone non-writing record's does. */
async function completeTrailingCommands({
	scope,
	entries,
	results,
}: {
	scope: PartitionProcessorScope;
	entries: QueuedTrackEntry[];
	results: QueuedTrackOutcome[];
}): Promise<void> {
	let lastDecided = -1;
	let lastWrite = -1;
	for (const [index, result] of results.entries()) {
		if (result.kind !== "decided") break;
		lastDecided = index;
		if (result.decided.kind === "write") lastWrite = index;
	}
	const trailing = entries[lastDecided];
	if (lastDecided === lastWrite || !trailing) return;
	await scope.ctx.writer.waitForStore();
	await scope.ctx.writer.flushDeferredLogs();
	scope.ctx.writer.assertCommitsHealthy();
	await completeCommand({ scope, source: trailing.source });
}
