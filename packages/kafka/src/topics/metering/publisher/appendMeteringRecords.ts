import { sendIdempotentBatch } from "../../../producer/sendIdempotentBatch.js";
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
	offsets,
}: MeteringAppend & {
	ctx: MeteringPublisherContext;
}): Promise<{ baseOffset: bigint }> {
	if (records.length === 0) {
		throw new RangeError("Metering record batch cannot be empty");
	}
	const messages: { key: Buffer; value: Buffer }[] = [];
	for (const record of records) {
		messages.push(serializeMeteringRecord({ record }));
	}
	if (ctx.commit?.mode !== "idempotent") {
		return sendTransactionalBatch({
			producer: ctx.producer,
			topic,
			partition,
			messages,
			offsets,
		});
	}
	if (!ctx.producer.send)
		throw new Error("Idempotent commits need a producer with a plain send");
	const appended = await sendIdempotentBatch({
		sender: { send: ctx.producer.send },
		topic,
		partition,
		messages,
		ownerEpoch: ctx.ownerEpoch?.(),
	});
	// No longer atomic with the batch: a crash between the two redelivers the command, and its id makes the replay a no-op.
	if (offsets) {
		if (!ctx.commandOffsets)
			throw new Error("Idempotent commits need a command offset committer");
		await ctx.commandOffsets.commit(offsets);
	}
	return appended;
}
