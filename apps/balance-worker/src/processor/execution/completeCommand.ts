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
	// A skipped command leaves no record; its offset lands through the group commit after a gap,
	// and the Postgres bookmark, saved below, is what skips a restart past it.
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
