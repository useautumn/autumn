import type { MutationSource } from "@autumn/balance-engine";
import type { SyncTrack, TrackRuns } from "../runs/createTrackRuns.js";
import type { DeferredLogSink } from "../types/deferredLogSink.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	CommittedMutation,
	MutationSubmission,
} from "../writer/types/mutation.js";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";
import { completeCommand } from "./completeCommand.js";

export async function executeCommand<Decision>({
	scope,
	source,
	run,
	deferredLogs,
}: {
	scope: PartitionProcessorScope;
	source: MutationSource;
	run: (scope: PartitionProcessorScope) => Promise<Decision>;
	deferredLogs?: DeferredLogSink;
}): Promise<Decision> {
	let wroteMutation = false;
	let precedingWrites = scope.ctx.writer.waitForStore();
	function decide<Reply>(submission: MutationSubmission<Reply>) {
		// Refusals can throw before returning a decision, but still depend on preceding writes.
		precedingWrites = scope.ctx.writer.waitForStore();
		const decided = scope.ctx.writer.decide({ ...submission, source });
		wroteMutation ||= decided.kind === "write";
		return decided;
	}
	function log(params: Parameters<PartitionWriter["log"]>[0]) {
		const logged = scope.ctx.writer.log({
			...params,
			source,
			defersCommit: deferredLogs !== undefined,
		});
		wroteMutation = true;
		if (!deferredLogs) return logged;
		deferredLogs.add(logged);
		return Promise.resolve();
	}

	const result = await run({
		...scope,
		// Its tracks take their turn behind a subject's waiting run, but decide alone, on this writer, stamped.
		trackRuns: scope.trackRuns && soloTrackRuns({ trackRuns: scope.trackRuns }),
		ctx: {
			...scope.ctx,
			writer: { ...scope.ctx.writer, decide, log },
		},
	});
	// Joined and skipped commands have no new mutation to carry their offset.
	if (!wroteMutation) {
		scope.ctx.writer.hurryStore();
		await precedingWrites;
		await scope.ctx.writer.flushDeferredLogs();
		// An earlier queued command whose commit failed is a gap this bookmark must not pass.
		scope.ctx.writer.assertCommitsHealthy();
		await completeCommand({ scope, source });
	}
	return result;
}

function soloTrackRuns({ trackRuns }: { trackRuns: TrackRuns }): TrackRuns {
	async function track(track: SyncTrack) {
		const decided = await trackRuns.decideInTurn(track);
		const committed = (await decided.waitForCommit()) as CommittedMutation;
		return track.answer({ committed, runState: null });
	}
	return { ...trackRuns, track };
}
