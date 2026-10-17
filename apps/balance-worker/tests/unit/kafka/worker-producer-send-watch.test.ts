import { describe, expect, test } from "bun:test";
import type {
	KafkaProducerSession,
	ProducerRecord,
	RecordMetadata,
} from "@autumn/kafka";
import { createPartitionSendWatches } from "../../../src/health/ownNetwork/createPartitionSendWatches.js";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";

const topic = "metering";
const partition = 4;

function createHeldSession() {
	const held: {
		record: ProducerRecord;
		settle: ReturnType<typeof Promise.withResolvers<RecordMetadata[]>>;
	}[] = [];
	const session: KafkaProducerSession = {
		connect: async () => {},
		fence: async () => {},
		transaction: async () => {
			throw new Error("No transactions in this test");
		},
		send: (record) => {
			const settle = Promise.withResolvers<RecordMetadata[]>();
			held.push({ record, settle });
			return settle.promise;
		},
		isUsable: () => true,
		disconnect: async () => {},
		mode: "idempotent",
	};
	return { session, held };
}

function landedAt(baseOffset: string): RecordMetadata[] {
	return [{ topicName: topic, partition, errorCode: 0, baseOffset }];
}

function always(): boolean {
	return true;
}

describe("worker producer send watch", () => {
	test("the fence marker and every later send are timed on the partition's watch", async () => {
		const time = { now: 0 };
		const watches = createPartitionSendWatches({
			ctx: { now: () => time.now, holdingOf: () => 1 },
		});
		const { session, held } = createHeldSession();
		const producer = createWorkerProducer({
			ctx: {
				session,
				ownerEpoch: () => "12",
				sendWatch: watches.watchFor({ partition }),
			},
			config: { topic, partition },
		});
		const fenced = producer.fenceOwnership();
		time.now = 1_300;
		expect(watches.take({ now: time.now, isCurrent: always })).toEqual([
			{ partition, holding: 1, longestInFlightMs: 1_300 },
		]);
		held[0]?.settle.resolve(landedAt("40"));
		await fenced;
		expect(watches.take({ now: time.now, isCurrent: always })).toEqual([
			{ partition, holding: 1, longestInFlightMs: 1_300 },
		]);
		const sent = producer.send({
			topic,
			messages: [{ partition, value: "command" }],
		});
		time.now = 1_500;
		held[1]?.settle.resolve(landedAt("41"));
		await sent;
		expect(watches.take({ now: 2_000, isCurrent: always })).toEqual([
			{ partition, holding: 1, longestInFlightMs: 200 },
		]);
	});

	test("a send that fails still counts its time and still fails", async () => {
		const time = { now: 0 };
		const watches = createPartitionSendWatches({
			ctx: { now: () => time.now, holdingOf: () => 1 },
		});
		const { session, held } = createHeldSession();
		const producer = createWorkerProducer({
			ctx: { session, sendWatch: watches.watchFor({ partition }) },
			config: { topic, partition },
		});
		const sent = producer.send({
			topic: "elsewhere",
			messages: [{ value: "probe" }],
		});
		time.now = 2_400;
		held[0]?.settle.reject(new Error("Local: Message timed out"));
		await expect(sent).rejects.toThrow();
		expect(watches.take({ now: 2_500, isCurrent: always })).toEqual([
			{ partition, holding: 1, longestInFlightMs: 2_400 },
		]);
	});
});
