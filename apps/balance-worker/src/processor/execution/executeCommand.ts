import type { MutationSource } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationSubmission } from "../writer/types/mutation.js";
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
	deferredLogs?: Promise<void>[];
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
		deferredLogs.push(logged);
		return Promise.resolve();
	}

	// A queued evict's snapshot DELETE settles with the batch, like its log: awaited per record, a storm would serialize.
	function evict(params: Parameters<PartitionWriter["evict"]>[0]) {
		if (!deferredLogs) return scope.ctx.writer.evict(params);
		return scope.ctx.writer.evict({
			...params,
			deferSnapshotDrop: (dropped) => deferredLogs.push(dropped),
		});
	}

	const result = await run({
		...scope,
		ctx: {
			...scope.ctx,
			writer: { ...scope.ctx.writer, decide, log, evict },
		},
	});
	// Joined and skipped commands have no new mutation to carry their offset.
	if (!wroteMutation) {
		await precedingWrites;
		await scope.ctx.writer.flushDeferredLogs();
		await completeCommand({ scope, source });
	}
	return result;
}
