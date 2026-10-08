import { describe, expect, test } from "bun:test";
import { createLibrdkafkaConsumer } from "../../src/client/librdkafka/consumer/createLibrdkafkaConsumer.js";
import type {
	NativeConsumer,
	NativeKafkaError,
	NativeMessage,
	NativeRebalanceCallback,
	NativeTopicPartition,
	NativeTopicPartitionOffset,
} from "../../src/client/librdkafka/consumer/types/nativeConsumer.js";
import { createKafkaLog } from "../../src/client/librdkafka/kafkaLog.js";
import {
	type ConsumerConfig,
	type EachBatchPayload,
	KafkaConsumerLeaseLostError,
} from "../../src/kafka.js";

const ASSIGN = -175;
const REVOKE = -174;
const topic = "metering";

type Step =
	| { kind: "rebalance"; code: number; partitions: NativeTopicPartition[] }
	| { kind: "message"; partition: number; offset: number; value?: string }
	| { kind: "eof"; partition: number; offset: number }
	| { kind: "error"; error: NativeKafkaError };

/** A native consumer driven by a script: each `consume()` plays the next chunk, the way librdkafka serves
 *  rebalances and records from inside a poll. */
function createFakeNative() {
	const chunks: Step[][] = [];
	const calls: string[] = [];
	const listeners = new Map<string, ((...args: never[]) => void)[]>();
	const assignments: NativeTopicPartitionOffset[][] = [];
	const current = new Map<number, NativeTopicPartition>();
	const seeks: NativeTopicPartitionOffset[] = [];
	const commits: NativeTopicPartitionOffset[][] = [];
	const committed = new Map<string, number>();
	let rebalance: NativeRebalanceCallback | undefined;
	let consumeWaiter: (() => void) | undefined;

	function emit(event: string, ...args: unknown[]): void {
		for (const listener of listeners.get(event) ?? [])
			(listener as (...a: unknown[]) => void)(...args);
	}

	function play(): NativeKafkaError | null {
		const chunk = chunks.shift() ?? [];
		const messages: NativeMessage[] = [];
		let error: NativeKafkaError | null = null;
		for (const step of chunk) {
			if (step.kind === "rebalance")
				rebalance?.(
					Object.assign(new Error("rebalance"), { code: step.code }),
					step.partitions,
				);
			else if (step.kind === "message") {
				const message = {
					topic,
					partition: step.partition,
					offset: step.offset,
					key: null,
					value: Buffer.from(step.value ?? `v${step.offset}`),
				};
				messages.push(message);
				emit("data", message);
			} else if (step.kind === "eof")
				emit("partition.eof", {
					topic,
					partition: step.partition,
					offset: step.offset,
				});
			else error = step.error;
		}
		return error;
	}

	const native: NativeConsumer = {
		connect(_options, done) {
			calls.push("connect");
			done(null);
		},
		disconnect(done) {
			calls.push("disconnect");
			done(null);
		},
		subscribe(topics) {
			calls.push(`subscribe:${topics.join(",")}`);
		},
		unsubscribe() {
			calls.push("unsubscribe");
			chunks.unshift([
				{ kind: "rebalance", code: REVOKE, partitions: [...current.values()] },
			]);
		},
		setDefaultConsumeTimeout() {},
		setDefaultIsTimeoutOnlyForFirstMessage() {},
		consume(_count, done) {
			if (chunks.length > 0) {
				const error = play();
				queueMicrotask(() => done(error, []));
				return;
			}
			consumeWaiter = () => {
				consumeWaiter = undefined;
				const error = play();
				done(error, []);
			};
			setTimeout(() => consumeWaiter?.(), 5);
		},
		assign(partitions) {
			assignments.push(partitions as NativeTopicPartitionOffset[]);
		},
		unassign() {
			calls.push("unassign");
		},
		incrementalAssign(partitions) {
			calls.push(
				`incrementalAssign:${partitions.map((p) => p.partition).join(",")}`,
			);
			assignments.push(partitions as NativeTopicPartitionOffset[]);
			for (const { topic, partition } of partitions)
				current.set(partition, { topic, partition });
		},
		incrementalUnassign(partitions) {
			calls.push(
				`incrementalUnassign:${partitions.map((p) => p.partition).join(",")}`,
			);
			for (const { partition } of partitions) current.delete(partition);
		},
		rebalanceProtocol: () => "COOPERATIVE",
		seek(position, _timeout, done) {
			seeks.push(position);
			done(null);
		},
		pause(partitions) {
			calls.push(`pause:${partitions.map((p) => p.partition).join(",")}`);
		},
		resume(partitions) {
			calls.push(`resume:${partitions.map((p) => p.partition).join(",")}`);
		},
		commitCb(offsets, done) {
			commits.push(offsets);
			for (const { partition, offset } of offsets)
				committed.set(String(partition), offset);
			done(null);
		},
		committed(partitions, _timeout, done) {
			done(
				null,
				partitions.map(({ topic, partition }) => ({
					topic,
					partition,
					offset: committed.get(String(partition)) ?? -1001,
				})),
			);
		},
		getWatermarkOffsets: () => ({ highOffset: 100, lowOffset: 0 }),
		on(event, listener) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
		},
	};

	function factory({
		global,
	}: {
		global: Record<string, unknown>;
	}): NativeConsumer {
		rebalance = global.rebalance_cb as NativeRebalanceCallback;
		return native;
	}

	return {
		native,
		factory,
		chunks,
		calls,
		assignments,
		seeks,
		commits,
		committed,
	};
}

function createRunner({
	config = {},
}: {
	config?: Partial<ConsumerConfig>;
} = {}) {
	const fake = createFakeNative();
	const logs: string[] = [];
	const sink = {
		error: (l: string) => logs.push(l),
		warn: (l: string) => logs.push(l),
		info: () => {},
		debug: () => {},
	};
	const consumer = createLibrdkafkaConsumer({
		ctx: {
			createNative: fake.factory,
			nativeClientConfig: {},
			log: createKafkaLog({ clientId: "t", sink }),
		},
		config: { groupId: "g", retry: { initialRetryTime: 1 }, ...config },
	});
	const events: string[] = [];
	consumer.on(consumer.events.REBALANCING, () => events.push("rebalancing"));
	consumer.on(consumer.events.GROUP_JOIN, (event) =>
		events.push(
			`join:${(event.payload.memberAssignment[topic] ?? []).join(",")}`,
		),
	);
	consumer.on(consumer.events.CRASH, (event) =>
		events.push(`crash:${event.payload.restart}`),
	);
	consumer.on(consumer.events.END_BATCH_PROCESS, (event) =>
		events.push(
			`end:${event.payload.partition}:${event.payload.batchSize}:${event.payload.lastOffset}`,
		),
	);
	return { fake, consumer, events, logs };
}

function partitions(...numbers: number[]): NativeTopicPartition[] {
	return numbers.map((partition) => ({ topic, partition }));
}

async function until(
	predicate: () => boolean,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = performance.now() + timeoutMs;
	while (!predicate()) {
		if (performance.now() > deadline) throw new Error("condition not reached");
		await Bun.sleep(2);
	}
}

describe("librdkafka consumer runner", () => {
	test("each group change reads as kafkajs's: everything revoked, then the whole assignment", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push(
			[{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) }],
			[{ kind: "rebalance", code: ASSIGN, partitions: partitions(2) }],
			[{ kind: "rebalance", code: REVOKE, partitions: partitions(0) }],
		);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => events.length >= 6);
		expect(events.slice(0, 6)).toEqual([
			"rebalancing",
			"join:0,1",
			"rebalancing",
			"join:0,1,2",
			"rebalancing",
			"join:1,2",
		]);
		expect(fake.calls).toContain("incrementalUnassign:0");
		await consumer.disconnect();
	});

	test("a seek or pause asked for while hearing of an assignment lands with the assignment", async () => {
		const { fake, consumer } = createRunner();
		consumer.on(consumer.events.GROUP_JOIN, () => {
			consumer.seek({ topic, partition: 3, offset: "42" });
			consumer.pause([{ topic, partitions: [4] }]);
		});
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(3, 4) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.assignments.length > 0);
		expect(fake.assignments[0]).toEqual([
			{ topic, partition: 3, offset: 42 },
			{ topic, partition: 4 },
		] as NativeTopicPartitionOffset[]);
		expect(fake.calls).toContain("pause:4");
		await consumer.disconnect();
	});

	test("a partition end is reported as the empty batch kafkajs reported for markers", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 5 },
			{ kind: "eof", partition: 0, offset: 8 },
		]);
		const batches: string[][] = [];
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch, resolveOffset }) => {
				batches.push(batch.messages.map((m) => m.offset));
				resolveOffset(batch.lastOffset());
			},
		});
		await until(() => events.some((e) => e.startsWith("end:0:0")));
		expect(batches).toEqual([["5"]]);
		expect(events.filter((e) => e.startsWith("end:"))).toEqual([
			"end:0:1:5",
			"end:0:0:7",
		]);
		await consumer.disconnect();
	});

	test("records a batch left unresolved are fetched again from the first of them", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 10 },
			{ kind: "message", partition: 0, offset: 11 },
			{ kind: "message", partition: 0, offset: 12 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatchAutoResolve: false,
			eachBatch: async ({ resolveOffset }) => resolveOffset("10"),
		});
		await until(() => fake.seeks.length > 0);
		expect(fake.seeks[0]).toEqual({ topic, partition: 0, offset: 11 });
		await consumer.disconnect();
	});

	test("when one partition's batch fails, the others' heartbeats throw: the restart takes their lease too", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) },
			{ kind: "message", partition: 0, offset: 1 },
			{ kind: "message", partition: 1, offset: 1 },
		]);
		const failed = Promise.withResolvers<void>();
		let heartbeatFailure: unknown;
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			partitionsConsumedConcurrently: 2,
			eachBatch: async ({ batch, heartbeat }: EachBatchPayload) => {
				if (batch.partition === 1) {
					setTimeout(failed.resolve, 5);
					throw new Error("handler failed");
				}
				await failed.promise;
				heartbeatFailure = await heartbeat().catch((cause) => cause);
			},
		});
		await until(() => heartbeatFailure !== undefined);
		expect(heartbeatFailure).toBeInstanceOf(KafkaConsumerLeaseLostError);
		await until(() => events.includes("crash:true"));
		expect(events.filter((e) => e === "crash:true")).toHaveLength(1);
		await consumer.disconnect();
	});

	test("a failed batch crashes and restarts from the last commit, the way kafkajs rejoined", async () => {
		const { fake, consumer, events } = createRunner();
		fake.committed.set("0", 7);
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 9 },
		]);
		let attempts = 0;
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async () => {
				attempts++;
				throw new Error("handler failed");
			},
		});
		await until(() => events.filter((e) => e.startsWith("join:")).length >= 2);
		expect(attempts).toBe(1);
		expect(events).toContain("crash:true");
		expect(fake.seeks).toContainEqual({ topic, partition: 0, offset: 7 });
		await consumer.disconnect();
	});

	test("a consumer told not to restart ends at its first failed batch", async () => {
		const { fake, consumer, events } = createRunner({
			config: { retry: { restartOnFailure: async () => false } },
		});
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 9 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async () => {
				throw new Error("handler failed");
			},
		});
		await until(() => events.includes("crash:false"));
		expect(events.filter((e) => e.startsWith("join:"))).toHaveLength(1);
		await consumer.disconnect();
	});

	test("a broker refusing the group ends the consumer for its owner to rejoin", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{
				kind: "error",
				error: Object.assign(new Error("Broker: Group authorization failed"), {
					code: 30,
				}),
			},
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => events.some((e) => e.startsWith("crash:")));
		expect(events).toContain("crash:false");
		await consumer.disconnect();
	});

	test("stop leaves the group and serves the revocation without reporting it as a group change", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => events.includes("join:0,1"));
		const before = events.length;
		await consumer.stop();
		expect(fake.calls).toContain("unsubscribe");
		expect(fake.calls).toContain("incrementalUnassign:0,1");
		expect(events.slice(before)).toEqual([]);
		await consumer.disconnect();
		expect(fake.calls.at(-1)).toBe("disconnect");
	});

	test("records fetched for a partition paused meanwhile are fetched again once it resumes", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		const delivered: string[] = [];
		await consumer.run({
			eachBatch: async ({ batch, resolveOffset }) => {
				delivered.push(...batch.messages.map((m) => m.offset));
				resolveOffset(batch.lastOffset());
			},
		});
		await until(() => fake.assignments.length > 0);
		consumer.pause([{ topic, partitions: [0] }]);
		fake.chunks.push([{ kind: "message", partition: 0, offset: 20 }]);
		await until(() => fake.chunks.length === 0);
		await Bun.sleep(20);
		expect(delivered).toEqual([]);
		consumer.resume([{ topic, partitions: [0] }]);
		expect(fake.seeks).toContainEqual({ topic, partition: 0, offset: 20 });
		await consumer.disconnect();
	});

	test("offsets resolved by the handler are what commitOffsetsIfNecessary commits", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(2) },
			{ kind: "message", partition: 2, offset: 3 },
			{ kind: "message", partition: 2, offset: 4 },
		]);
		let pending: unknown;
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatchAutoResolve: false,
			eachBatch: async (payload) => {
				payload.resolveOffset("4");
				pending = payload.uncommittedOffsets();
				await payload.commitOffsetsIfNecessary();
			},
		});
		await until(() => fake.commits.length > 0);
		expect(pending).toEqual({
			topics: [{ topic, partitions: [{ partition: 2, offset: "5" }] }],
		});
		expect(fake.commits[0]).toEqual([{ topic, partition: 2, offset: 5 }]);
		await consumer.disconnect();
	});
});
