import type { MutationSource } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	DecidedMutation,
	MutationSubmission,
} from "../writer/types/mutation.js";
import type { PartitionWriter } from "../writer/types/partitionWriter.js";
import { completeCommand } from "./completeCommand.js";

export async function executeCommand<Decision>({
	scope,
	source,
	run,
	deferredLogs,
	onDecided,
}: {
	scope: PartitionProcessorScope;
	source: MutationSource;
	run: (scope: PartitionProcessorScope) => Promise<Decision>;
	deferredLogs?: Promise<void>[];
	onDecided?: () => void;
}): Promise<Decision> {
	let wroteMutation = false;
	let precedingWrites = scope.ctx.writer.waitForStore();
	function decide<Reply>(submission: MutationSubmission<Reply>) {
		// Refusals can throw before returning a decision, but still depend on preceding writes.
		precedingWrites = scope.ctx.writer.waitForStore();
		const decided = scope.ctx.writer.decide({ ...submission, source });
		wroteMutation ||= decided.kind === "write";
		return onDecided ? signalOnCommitWait({ decided, onDecided }) : decided;
	}
	function log(params: Parameters<PartitionWriter["log"]>[0]) {
		const logged = scope.ctx.writer.log({
			...params,
			source,
			defersCommit: deferredLogs !== undefined,
		});
		wroteMutation = true;
		if (!deferredLogs) return logged;
		deferredLogs.push(logged);
		return Promise.resolve();
	}

	const result = await run({
		...scope,
		ctx: {
			...scope.ctx,
			writer: { ...scope.ctx.writer, decide, log },
		},
	});
	// Joined and skipped commands have no new mutation to carry their offset.
	if (!wroteMutation) {
		await precedingWrites;
		await scope.ctx.writer.flushDeferredLogs();
		// An earlier queued command that missed the log is a gap this bookmark must not pass.
		scope.ctx.writer.assertCommitsHealthy();
		await completeCommand({ scope, source });
	}
	return result;
}

/** The first commit wait means every decide of the run is enqueued, in order: what follows only waits. */
function signalOnCommitWait<Reply>({
	decided,
	onDecided,
}: {
	decided: DecidedMutation<Reply>;
	onDecided: () => void;
}): DecidedMutation<Reply> {
	function waitForCommit() {
		onDecided();
		return decided.waitForCommit();
	}
	return { ...decided, waitForCommit };
}
