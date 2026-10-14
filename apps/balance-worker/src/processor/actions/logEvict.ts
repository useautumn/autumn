import {
	computeEvict,
	type EvictCommand,
	type LoggedEvictCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export const logEvict = async ({
	scope,
	command,
	droppedState,
}: {
	scope: PartitionProcessorScope;
	command: EvictCommand;
	droppedState: SubjectState | null;
}): Promise<void> => {
	const loggedCommand: LoggedEvictCommand = {
		...command,
		commandId: `evict_${crypto.randomUUID()}`,
	};
	await scope.ctx.writer.log({
		command: loggedCommand,
		mutation: computeEvict({ state: droppedState, command: loggedCommand }),
	});
};
