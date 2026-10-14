import type { MutationSource } from "@autumn/balance-engine";
import type { DeferredLogSink } from "../types/deferredLogSink.js";
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
	deferredLogs?: DeferredLogSink;
}): Promise<Decision> {
	let wroteMutation = false;
	let precedingWrites = scope.ctx.writer.snapshotStore();
	function decide<Reply>(submission: MutationSubmission<Reply>) {
		precedingWrites = scope.ctx.writer.snapshotStore();
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
		ctx: {
			...scope.ctx,
			writer: { ...scope.ctx.writer, decide, log },
		},
	});
	if (!wroteMutation) {
		await precedingWrites();
		await scope.ctx.writer.flushDeferredLogs();
		scope.ctx.writer.assertCommitsHealthy();
		await completeCommand({ scope, source });
	}
	return result;
}
