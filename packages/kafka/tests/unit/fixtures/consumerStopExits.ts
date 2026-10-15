/** Runs a consumer over an idle native client, stops it, and returns: the process must end on its own right after. */
import { createLibrdkafkaConsumer } from "../../../src/client/librdkafka/consumer/createLibrdkafkaConsumer.js";
import type { NativeConsumer } from "../../../src/client/librdkafka/consumer/types/nativeConsumer.js";
import { createKafkaLog } from "../../../src/client/librdkafka/kafkaLog.js";

function noop(): void {}
const native = {
	connect(_options: unknown, done: (error: null) => void) {
		done(null);
	},
	disconnect(done: (error: null) => void) {
		done(null);
	},
	subscribe: noop,
	unsubscribe: noop,
	setDefaultConsumeTimeout: noop,
	setDefaultIsTimeoutOnlyForFirstMessage: noop,
	consume(_count: number, done: (error: null, messages: never[]) => void) {
		queueMicrotask(() => done(null, []));
	},
	on: noop,
} as unknown as NativeConsumer;

const consumer = createLibrdkafkaConsumer({
	ctx: {
		createNative: () => native,
		nativeClientConfig: {},
		log: createKafkaLog({
			clientId: "stop-exits",
			sink: { error: noop, warn: noop, info: noop, debug: noop },
		}),
	},
	config: { groupId: "stop-exits" },
});
await consumer.connect();
await consumer.subscribe({ topics: ["t"], fromBeginning: true });
await consumer.run({ eachBatch: async () => {} });
await Bun.sleep(50);
await consumer.disconnect();
console.log(`stopped ${Date.now()}`);
