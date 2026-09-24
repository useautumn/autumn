import {
	type FlushCommand,
	meteringIdentityToPartitionKey,
	parseFlushCommand,
} from "@autumn/balance-engine";
import type { FlushReply } from "@autumn/balance-worker-client/protocol";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** A reader of Postgres is next: the customer's pending writes commit, then the store takes everything queued so far. Nothing is dropped. */
export async function flush({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FlushCommand;
}): Promise<FlushReply> {
	const { identity } = parseFlushCommand({ input: command });
	const customerKey = meteringIdentityToPartitionKey({ identity });
	await scope.ctx.writer.waitForPendingCommits({ customerKey });
	await scope.ctx.writer.waitForStore();
	return { stored: true };
}
