import type { MutationSource } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationSubmission } from "../writer/types/mutation.js";
import { completeCommand } from "./completeCommand.js";

export async function executeCommand<Decision>({
	scope,
	source,
	run,
}: {
	scope: PartitionProcessorScope;
	source: MutationSource;
	run: (scope: PartitionProcessorScope) => Promise<Decision>;
}): Promise<Decision> {
	let wroteMutation = false;
	function decide<Reply>(submission: MutationSubmission<Reply>) {
		return scope.ctx.writer.decide({
			...submission,
			source,
			mutate: (params) => {
				const result = submission.mutate(params);
				if (result.kind === "write") wroteMutation = true;
				return result;
			},
		});
	}

	const result = await run({
		...scope,
		ctx: {
			...scope.ctx,
			writer: { ...scope.ctx.writer, decide },
		},
	});
	// Joined and skipped commands have no new mutation to carry their offset.
	if (!wroteMutation) await completeCommand({ scope, source });
	return result;
}
