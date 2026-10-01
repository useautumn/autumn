import { describe, expect, test } from "bun:test";
import type { KafkaProducerSession } from "@autumn/kafka";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";
import {
	OwnedPartitionLogDivergedError,
	OwnedPartitionProducerFencedError,
	OwnedPartitionUnfencedError,
} from "../../../src/runtime/runtimeErrors.js";

const topic = "metering";
const partition = 4;

function createFakeSession({
	mode,
	sendError,
	baseOffsets = [],
}: {
	mode: KafkaProducerSession["mode"];
	sendError?: Error;
	baseOffsets?: string[];
}) {
	const calls: string[] = [];
	const records: ProducerRecord[] = [];
	const landing = [...baseOffsets];
	function nextBaseOffset(): string {
		if (landing.length === 0) return "41";
		const next = landing.shift() as string;
		if (landing.length === 0) landing.push(next);
		return next;
	}
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
			return [
				{
					topicName: topic,
					partition,
					errorCode: 0,
					baseOffset: nextBaseOffset(),
				},
			];
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

function batchOf(count: number): ProducerRecord {
	const messages = Array.from({ length: count }, (_, index) => ({
		key: Buffer.from(`k${index}`),
		value: Buffer.from("v"),
	}));
	return { topic, messages };
}

describe("worker producer log contiguity", () => {
	test("after the marker, each batch must land right behind the last write", async () => {
		const fake = createFakeSession({
			mode: "idempotent",
			baseOffsets: ["41", "42", "44"],
		});
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "2516" },
			config: { topic, partition },
		});
		expect(await producer.fenceOwnership()).toEqual({ offset: 41n });
		await producer.send(batchOf(2));
		await producer.send(batchOf(1));
		expect(fake.calls).toEqual(["send", "send", "send"]);
	});

	test("a batch that lands past the expected offset is a diverged log: fenced, not acknowledged", async () => {
		const fake = createFakeSession({
			mode: "idempotent",
			baseOffsets: ["41", "43"],
		});
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "2516" },
			config: { topic, partition },
		});
		await producer.fenceOwnership();
		const failure = await producer.send(batchOf(1)).catch((cause) => cause);
		expect(failure).toBeInstanceOf(OwnedPartitionLogDivergedError);
		expect(failure).toBeInstanceOf(OwnedPartitionProducerFencedError);
		expect(failure.expectedOffset).toBe(42n);
		expect(failure.actualOffset).toBe(43n);
	});

	test("without a marker an idempotent batch is refused before anything is sent", async () => {
		const fake = createFakeSession({ mode: "idempotent" });
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => undefined },
			config: { topic, partition },
		});
		expect(await producer.fenceOwnership()).toBeNull();
		await expect(producer.send(batchOf(1))).rejects.toBeInstanceOf(
			OwnedPartitionUnfencedError,
		);
		expect(fake.calls).toEqual([]);
	});

	test("records for another topic through the same session are neither anchored nor checked", async () => {
		const fake = createFakeSession({
			mode: "idempotent",
			baseOffsets: ["41", "900", "42"],
		});
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "2516" },
			config: { topic, partition },
		});
		await producer.fenceOwnership();
		await producer.send({ ...batchOf(1), topic: "ownership" });
		await producer.send(batchOf(1));
		expect(fake.calls).toEqual(["send", "send", "send"]);
	});

	test("transactional commits never check offsets: the broker fences", async () => {
		const fake = createFakeSession({
			mode: "transactional",
			baseOffsets: ["41", "99"],
		});
		const producer = createWorkerProducer({
			ctx: { session: fake.session, ownerEpoch: () => "9" },
			config: { topic, partition },
		});
		await producer.send(batchOf(1));
		await producer.send(batchOf(1));
		expect(fake.calls).toEqual(["send", "send"]);
	});
});
