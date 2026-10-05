import { expect, spyOn, test } from "bun:test";
import { KafkaJSError } from "kafkajs";
import { createThreadedProducers } from "../../../../src/kafka/producerThread/createThreadedProducers.js";
import * as enqueue from "../../../../src/kafka/producerThread/producers/enqueueSend.js";

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (cause) {
		return cause;
	}
	throw new Error("expected a rejection");
}

test("a send that cannot be handed to the thread fails, and so does every later send from that producer, instead of being held forever behind the missing one", async () => {
	const producers = createThreadedProducers({
		ctx: {
			logger: { warn() {}, error() {} },
			onFatal({ cause }) {
				throw cause;
			},
		},
		config: {
			clientId: "test-client",
			brokers: ["fake:9092"],
			authMode: "none",
			limits: {
				connectionTimeoutMs: 1000,
				requestTimeoutMs: 1000,
				retryCount: 1,
				initialRetryTimeMs: 1,
				maxRetryTimeMs: 1,
			},
			sendRingBytes: 1 << 16,
			ackRingBytes: 1 << 16,
			threadUrl: new URL("./fakeProducerThread.ts", import.meta.url).href,
		},
	});
	await producers.start();
	const refused = spyOn(enqueue, "enqueueSend").mockImplementationOnce(() => {
		throw new Error("ring and port both refused the frame");
	});
	try {
		const producer = producers.producer({ idempotent: true });
		await producer.connect();
		const send = producer.send;
		if (!send) throw new Error("no send");
		const record = {
			topic: "outcomes",
			messages: [{ key: "k", value: "v", partition: 0 }],
		};
		const first = await rejectionOf(send(record));
		const second = await rejectionOf(send(record));
		expect(first).toBeInstanceOf(KafkaJSError);
		expect((first as Error).message).toContain(
			"could not hand a send to the producer thread",
		);
		expect(second).toBe(first);
		await producer.disconnect();
	} finally {
		refused.mockRestore();
		await producers.stop();
	}
});
