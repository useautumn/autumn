import { CompressionTypes } from "kafkajs";
import { serializeCommandRecord } from "../commandTopic.js";
import type {
	CommandAppend,
	CommandPublisherContext,
} from "./types/commandPublisher.js";

export async function appendCommandRecords({
	ctx,
	records,
}: CommandAppend & {
	ctx: CommandPublisherContext;
}): Promise<void> {
	if (records.length === 0) {
		throw new RangeError("Command record batch cannot be empty");
	}
	const messages: { key: Buffer; value: Buffer; partition: number }[] = [];
	for (const { partition, command } of records) {
		messages.push({
			...serializeCommandRecord({ record: command }),
			partition,
		});
	}
	// acks -1 is what an idempotent producer requires; every message is acknowledged or the send throws.
	await ctx.producer.send({
		topic: ctx.topic,
		messages,
		acks: -1,
		compression: CompressionTypes.GZIP,
	});
}
