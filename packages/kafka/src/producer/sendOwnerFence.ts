import { KafkaJSProtocolError } from "kafkajs";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "../client/kafkaErrors.js";
import { metadataToBaseOffset } from "../client/kafkaOffsetUtils.js";
import type { KafkaSender } from "../client/types/kafkaClient.js";
import { assertNonEmpty } from "../lib/assert.js";
import { OWNER_EPOCH_HEADER } from "./sendIdempotentBatch.js";

export const OWNER_FENCE_HEADER = "ownerFence";
export const OWNER_FENCE_KEY = "owner-fence";

const DECIMAL_EPOCH = /^\d+$/;

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
