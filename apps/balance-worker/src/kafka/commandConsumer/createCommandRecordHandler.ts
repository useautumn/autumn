import {
	parseCommandRecord,
	parseKafkaOffset,
	type TopicRecord,
	type TopicRecordHandler,
	type TopicRecordResult,
	type TopicResumePosition,
} from "@autumn/kafka";
import { consumeTrack } from "../../consume/consumeTrack.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import { CommandPartitionUnavailableError } from "./commandConsumerErrors.js";
import type { CommandConsumerContext } from "./types/commandConsumer.js";

/** The command stream's transport: a record in, its partition's runtime found, the `consume/` layer called. No business logic here. */
export function createCommandRecordHandler({
	ctx,
}: {
	ctx: CommandConsumerContext;
}): TopicRecordHandler {
	/** Postgres says how far the commands are decided; a batch starting below that is skipped forward, never re-decided. */
	function readResumeOffset({
		partition,
		firstOffset,
	}: TopicResumePosition): bigint | null {
		const bookmark = ctx.readCommandNextOffset({ partition });
		if (bookmark === null || firstOffset >= bookmark) return null;
		return bookmark;
	}

	async function applyRecord({
		topic,
		partition,
		message,
	}: TopicRecord): Promise<TopicRecordResult> {
		const offset = parseKafkaOffset({ offset: message.offset });
		const runtime = ctx.findOwnedRuntime({ partition });
		if (!runtime)
			throw new CommandPartitionUnavailableError({ topic, partition });
		const bookmark = ctx.readCommandNextOffset({ partition });
		if (bookmark !== null && offset < bookmark) return { nextOffset: bookmark };
		const source = { commandOffset: offset.toString() };
		async function run(processor: PartitionProcessor) {
			let command: ReturnType<typeof parseCommandRecord>;
			try {
				command = parseCommandRecord({
					key: message.key,
					value: message.value,
				});
			} catch (cause) {
				// A record nobody can read must not take the partition down with it.
				ctx.logger?.warn("Queued command skipped: unreadable", {
					topic,
					partition,
					offset: offset.toString(),
					error: cause,
				});
				return;
			}
			switch (command.type) {
				case "track": {
					await consumeTrack({
						ctx: { processor, logger: ctx.logger },
						command,
					});
					break;
				}
				default:
					ctx.logger?.warn("Queued command skipped: not consumable yet", {
						topic,
						partition,
						offset: offset.toString(),
						commandType: command.type,
						commandId: command.commandId,
					});
			}
		}
		return runtime.process((processor) => processor.execute({ source, run }));
	}

	return { readResumeOffset, applyRecord };
}
