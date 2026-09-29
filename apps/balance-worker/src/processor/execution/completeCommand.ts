import type { MutationSource } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export async function completeCommand({
	scope,
	source,
}: {
	scope: PartitionProcessorScope;
	source: MutationSource;
}): Promise<void> {
	const { ctx } = scope;
	const { topic, partition } = ctx.config;
	const commandNextOffset = BigInt(source.commandOffset) + 1n;
	const current = ctx.stateStore.readCommandNextOffset({ topic, partition });
	if (current !== null && current >= commandNextOffset) return;
	// Skipped commands have no outcome record; a crash before the Postgres bookmark
	// is saved can cause the command to be evaluated again on restart. The Kafka
	// offset only positions the consumer, and the Postgres bookmark skips it
	// forward, so it may ride with the next batch or land through the consumer
	// group's own commit after a short gap; a transaction per command would take
	// the partition's one transaction slot away from the batches.
	if (ctx.appender.settleCommandOffset) {
		ctx.appender.settleCommandOffset({
			topic,
			partition,
			nextOffset: commandNextOffset,
		});
	} else {
		if (!ctx.appender.commitCommandOffset)
			throw new Error("Command offset commits are unavailable");
		await ctx.appender.commitCommandOffset({
			topic,
			partition,
			nextOffset: commandNextOffset,
		});
	}
	await ctx.stateStore.advanceCommandNextOffset({
		topic,
		partition,
		commandNextOffset,
	});
}
