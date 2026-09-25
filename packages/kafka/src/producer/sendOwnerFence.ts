import { KafkaJSProtocolError } from "kafkajs";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "../client/kafkaErrors.js";
import { metadataToBaseOffset } from "../client/kafkaOffsetUtils.js";
import type { KafkaSender } from "../client/types/kafkaClient.js";
import { assertNonEmpty } from "../lib/assert.js";
import { OWNER_EPOCH_HEADER } from "./sendIdempotentBatch.js";

/** Marks a record as an ownership fence rather than a mutation; its value carries nothing a reader needs. */
export const OWNER_FENCE_HEADER = "ownerFence";
export const OWNER_FENCE_KEY = "owner-fence";

const DECIMAL_EPOCH = /^\d+$/;

/**
 * The one-trip commit has no broker fence, so the new owner writes the fence
 * itself: one record into the partition it now owns, stamped with its
 * ownership epoch. The partition's log is totally ordered, which is what
 * makes the marker a fence. Everything a lower epoch wrote before it is the
 * predecessor's last legitimate work and the new owner reads it while
 * catching up; anything a lower epoch writes after it came from an owner
 * that had already lost the partition, and every reader drops it.
 */
export async function sendOwnerFence({
	sender,
	topic,
	partition,
	ownerEpoch,
}: {
	sender: KafkaSender;
	topic: string;
	partition: number;
	ownerEpoch: string;
}): Promise<{ offset: bigint }> {
	assertNonEmpty({ name: "topic", value: topic });
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	if (!DECIMAL_EPOCH.test(ownerEpoch)) {
		throw new RangeError(`Invalid owner epoch: ${ownerEpoch}`);
	}
	const value = Buffer.from(
		JSON.stringify({ type: "owner_fence", ownerEpoch }),
		"utf8",
	);
	let metadata: Awaited<ReturnType<KafkaSender["send"]>>;
	try {
		metadata = await sender.send({
			topic,
			messages: [
				{
					key: Buffer.from(OWNER_FENCE_KEY, "utf8"),
					value,
					partition,
					headers: {
						[OWNER_EPOCH_HEADER]: ownerEpoch,
						[OWNER_FENCE_HEADER]: "1",
					},
				},
			],
			acks: -1,
		});
	} catch (cause) {
		if (cause instanceof KafkaJSProtocolError) {
			throw new KafkaBatchNotCommittedError({ cause });
		}
		throw new KafkaTransactionStateUnknownError({
			failureStage: "commit",
			cause,
		});
	}
	return { offset: metadataToBaseOffset({ metadata, topic, partition }) };
}
