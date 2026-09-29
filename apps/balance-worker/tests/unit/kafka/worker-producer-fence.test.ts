import { describe, expect, test } from "bun:test";
import type { KafkaProducerSession } from "@autumn/kafka";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";

const topic = "metering";
const partition = 4;

function createFakeSession({
	mode,
	sendError,
}: {
	mode: KafkaProducerSession["mode"];
	sendError?: Error;
}) {
	const calls: string[] = [];
	const records: ProducerRecord[] = [];
	const session: KafkaProducerSession = {
		connect: async () => {
			calls.push("connect");
		},
		fence: async () => {
			calls.push("fence");
		},
		transaction: async () => {
			throw new Error("No transactions in this test");
		},
		send: async (record): Promise<RecordMetadata[]> => {
			calls.push("send");
			records.push(record);
			if (sendError) throw sendError;
			return [{ topicName: topic, partition, errorCode: 0, baseOffset: "41" }];
		},
		isUsable: () => true,
		disconnect: async () => {
			calls.push("disconnect");
		},
		mode,
	};
	return { session, calls, records };
}

describe("worker producer ownership fence", () => {
	test("idempotent mode with a known epoch writes the marker and reports where it landed", async () => {
		const fake = createFakeSession({ mode: "idempotent" });
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "2516" },
			config: { topic, partition },
		});
		expect(await producer.fenceOwnership()).toEqual({ offset: 41n });
		expect(fake.calls).toEqual(["send"]);
		const [message] = fake.records[0]?.messages ?? [];
		expect(message?.partition).toBe(partition);
		expect(message?.headers).toEqual({ ownerEpoch: "2516", ownerFence: "1" });
	});

	test("nothing is written before a claim names the epoch, or under transactional commits", async () => {
		const unclaimed = createFakeSession({ mode: "idempotent" });
		const idle = createWorkerProducer({
			ctx: { session: unclaimed.session, ownerEpoch: () => undefined },
			config: { topic, partition },
		});
		expect(await idle.fenceOwnership()).toBeNull();
		expect(unclaimed.calls).toEqual([]);

		const transactional = createFakeSession({ mode: "transactional" });
		const brokerFenced = createWorkerProducer({
			ctx: { session: transactional.session, ownerEpoch: () => "9" },
			config: { topic, partition },
		});
		expect(await brokerFenced.fenceOwnership()).toBeNull();
		await brokerFenced.fence();
		expect(transactional.calls).toEqual(["fence"]);
	});

	test("activation's fence writes the marker too when the epoch arrived through a handoff", async () => {
		const fake = createFakeSession({ mode: "idempotent" });
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "77" },
			config: { topic, partition },
		});
		await producer.fence();
		expect(fake.calls).toEqual(["fence", "send"]);
		expect(fake.records[0]?.messages[0]?.headers).toEqual({
			ownerEpoch: "77",
			ownerFence: "1",
		});
	});

	test("a marker that may not have landed is reported as an unknown commit, not swallowed", async () => {
		const fake = createFakeSession({
			mode: "idempotent",
			sendError: new Error("request timed out"),
		});
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "1" },
			config: { topic, partition },
		});
		await expect(producer.fenceOwnership()).rejects.toThrow();
	});
});
