import {
	parseCommandRecord,
	parseKafkaOffset,
	type TopicRecord,
	type TopicRecordHandler,
	type TopicRecordResult,
	type TopicResumePosition,
} from "@autumn/kafka";
import { consumeTrack } from "../../consume/consumeTrack.js";
import { CommandPartitionUnavailableError } from "./commandConsumerErrors.js";
import type { CommandConsumerContext } from "./types/commandConsumer.js";

/** The command stream's transport: a record in, its partition's runtime found, the `consume/` layer called. No business logic here. */
export function createCommandRecordHandler({
	ctx,
}: {
	ctx: CommandConsumerContext;
}): TopicRecordHandler {
	/** The group's committed offset is the bookmark until the command offset rides on the mutation. */
	function readResumeOffset(_position: TopicResumePosition): null {
		return null;
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
		let command: ReturnType<typeof parseCommandRecord>;
		try {
			command = parseCommandRecord({ key: message.key, value: message.value });
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
			case "track":
				await consumeTrack({
					ctx: { runtime, logger: ctx.logger },
					command,
				});
				return;
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

	return { readResumeOffset, applyRecord };
}
