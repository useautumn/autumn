import { expect, test } from "bun:test";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import type {
	KafkaProducer,
	KafkaTransaction,
} from "../../../../../src/client/types/kafkaClient.js";
import { ownershipTopic } from "../../../../../src/topics/ownership/ownershipTopic.js";
import { createOwnershipPublisher } from "../../../../../src/topics/ownership/publisher/createOwnershipPublisher.js";

const topic = "balance-partition-owners";
const partition = 4;

function createFakeProducer({
	metadata = [
		{
			topicName: topic,
			partition,
			errorCode: 0,
			baseOffset: "11",
		},
	],
}: {
	metadata?: RecordMetadata[];
} = {}): {
	producer: KafkaProducer;
	records: ProducerRecord[];
} {
	const records: ProducerRecord[] = [];
	async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
		records.push(record);
		return metadata;
	}
	async function commit(): Promise<void> {}
	async function abort(): Promise<void> {}
	async function transaction(): Promise<KafkaTransaction> {
		return { send, commit, abort };
	}

	return {
		producer: { transaction },
		records,
	};
}

async function publishesClaimAndReturnsEpoch(): Promise<void> {
	const fake = createFakeProducer();
	const producer = createOwnershipPublisher({
		ctx: { producer: fake.producer },
		config: { topic },
	});

	await expect(
		producer.claim({
			partition,
			endpoint: "http://10.0.0.4:8080",
			claimedAt: 1_700_000_000_000,
		}),
	).resolves.toEqual({ routeEpoch: "11" });

	expect(fake.records[0]).toMatchObject({ topic, acks: -1 });
	expect(
		ownershipTopic.parse({
			key: Buffer.isBuffer(fake.records[0]?.messages[0]?.key)
				? fake.records[0].messages[0].key
				: null,
			value: Buffer.isBuffer(fake.records[0]?.messages[0]?.value)
				? fake.records[0].messages[0].value
				: null,
		}),
	).toEqual({
		schemaVersion: 1,
		type: "claimed",
		partition,
		endpoint: "http://10.0.0.4:8080",
		claimedAt: 1_700_000_000_000,
	});
}

async function publishesRelease(): Promise<void> {
	const fake = createFakeProducer({
		metadata: [
			{
				topicName: topic,
				partition,
				errorCode: 0,
				baseOffset: "12",
			},
		],
	});
	const producer = createOwnershipPublisher({
		ctx: { producer: fake.producer },
		config: { topic },
	});

	await expect(
		producer.release({ partition, releasedAt: 1_700_000_000_100 }),
	).resolves.toEqual({ routeEpoch: "12" });
	expect(
		ownershipTopic.parse({
			key: Buffer.isBuffer(fake.records[0]?.messages[0]?.key)
				? fake.records[0].messages[0].key
				: null,
			value: Buffer.isBuffer(fake.records[0]?.messages[0]?.value)
				? fake.records[0].messages[0].value
				: null,
		}).type,
	).toBe("unowned");
}

test(
	"claims with a transactional write and returns the offset epoch",
	publishesClaimAndReturnsEpoch,
);
test("releases with an unowned record", publishesRelease);
