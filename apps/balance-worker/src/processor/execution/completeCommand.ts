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
	if (!ctx.appender.commitCommandOffset)
		throw new Error("Command offset commits are unavailable");
	// Skipped commands have no outcome record; a crash before the Postgres bookmark
	// is saved can cause the command to be evaluated again on restart.
	await ctx.appender.commitCommandOffset({
		topic,
		partition,
		nextOffset: commandNextOffset,
	});
	await ctx.stateStore.advanceCommandNextOffset({
		topic,
		partition,
		commandNextOffset,
	});
}
