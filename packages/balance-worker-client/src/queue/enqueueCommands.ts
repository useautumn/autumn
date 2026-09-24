import type { CommandAppend } from "@autumn/kafka";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import { withAppendDeadline } from "../append/withAppendDeadline.js";
import { BalanceWorkerClientError } from "../types/balanceWorkerClientErrors.js";
import type { EnqueueParams, QueueContext } from "./types/queue.js";

/** One append for the whole batch; each command goes to the partition `resolveCommandRoute` would send it to. */
export async function enqueueCommands({
	ctx,
	commands,
	signal,
}: EnqueueParams & { ctx: QueueContext }): Promise<void> {
	if (commands.length === 0) return;
	if (!ctx.commandLog) {
		throw new BalanceWorkerClientError({
			code: "COMMAND_LOG_UNAVAILABLE",
			outcome: "not_submitted",
			message: "This client has no command log to queue on",
		});
	}
	const records: CommandAppend["records"][number][] = [];
	for (const command of commands) {
		records.push({
			partition: meteringIdentityToPartition({
				identity: command.identity,
				partitionCount: ctx.partitionCount,
			}),
			command,
		});
	}
	const commandLog = ctx.commandLog;
	function append(): Promise<void> {
		return commandLog.append({ records });
	}
	await withAppendDeadline({ timeoutMs: ctx.timeoutMs, signal, run: append });
}
