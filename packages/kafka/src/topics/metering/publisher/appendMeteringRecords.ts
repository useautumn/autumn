import { sendTransactionalBatch } from "../../../producer/sendTransactionalBatch.js";
import { serializeMeteringRecord } from "../meteringTopic.js";
import type {
	MeteringAppend,
	MeteringPublisherContext,
} from "./types/meteringPublisher.js";

export async function appendMeteringRecords({
	ctx,
	topic,
	partition,
	records,
}: MeteringAppend & {
	ctx: MeteringPublisherContext;
}): Promise<{ baseOffset: bigint }> {
	if (records.length === 0) {
		throw new RangeError("Track outcome batch cannot be empty");
	}
	const messages: { key: Buffer; value: Buffer }[] = [];
	for (const record of records) {
		messages.push(serializeMeteringRecord({ record }));
	}

	return sendTransactionalBatch({
		producer: ctx.producer,
		topic,
		partition,
		messages,
	});
}
