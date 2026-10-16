import { describe, expect, test } from "bun:test";

import { createConsumerGroupConfig } from "../../src/client/createConsumerGroupConfig.js";
import {
	createLibrdkafkaConsumer,
	STOP_LOOP_TIMEOUT_MS,
} from "../../src/client/librdkafka/consumer/createLibrdkafkaConsumer.js";

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
	type GroupProtocol,
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
	const consumeCounts: number[] = [];
	const listeners = new Map<string, ((...args: never[]) => void)[]>();
	const assignments: NativeTopicPartitionOffset[][] = [];
	const current = new Map<number, NativeTopicPartition>();
	const seeks: NativeTopicPartitionOffset[] = [];
	const seekOutcomes: (NativeKafkaError | null)[] = [];
	const commits: NativeTopicPartitionOffset[][] = [];
	const committed = new Map<string, number>();
	const watermark = { highOffset: 100 };
	const committedOutcomes: (NativeKafkaError | null)[] = [];
	const gate: { held?: Promise<void>; seek?: Promise<void> } = {};
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
		setDefaultConsumeTimeout(timeoutMs) {
			calls.push(`consumeTimeout:${timeoutMs}`);
		},
		setDefaultIsTimeoutOnlyForFirstMessage() {},
		consume(count, done) {
			consumeCounts.push(count);
			const held = gate.held;
			if (held) {
				gate.held = undefined;
				void held.then(() => done(play(), []));
				return;
			}
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
			const outcome = seekOutcomes.shift() ?? null;
			const held = gate.seek;
			if (held) {
				void held.then(() => {
					calls.push("seeked");
					done(outcome);
				});
				return;
			}
			queueMicrotask(() => done(outcome));
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
			const failure = committedOutcomes.shift();
			if (failure) {
				done(failure, []);
				return;
			}
			done(
				null,
				partitions.map(({ topic, partition }) => ({
					topic,
					partition,
					offset: committed.get(String(partition)) ?? -1001,
				})),
			);
		},
		getWatermarkOffsets: () => ({
			highOffset: watermark.highOffset,
			lowOffset: 0,
		}),
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
		consumeCounts,
		assignments,
		seeks,
		seekOutcomes,
		commits,
		committed,
		watermark,
		emit,
		committedOutcomes,
		gate,
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
	// A blocking poll holds one of the runtime's few native pool threads; enough idle consumers starve every producer commit.
	test("an idle poll never blocks a native pool thread: consume returns at once and the runner waits in JS", async () => {
		const { fake, consumer } = createRunner();
		await consumer.connect();
		await consumer.subscribe({ topics: [topic] });
		expect(fake.calls).toContain("consumeTimeout:0");
		await consumer.disconnect();
	});

	// The balance worker sets no maxRecordsPerPoll: its polls must stay at the 500 records they always asked for.
	test("a consumer that sets no maxRecordsPerPoll asks every poll for 500 records", async () => {
		const { fake, consumer } = createRunner();
		await consumer.connect();
		await consumer.subscribe({ topics: [topic] });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.consumeCounts.length >= 2);
		expect([...new Set(fake.consumeCounts)]).toEqual([500]);
		await consumer.disconnect();
	});

	test("maxRecordsPerPoll is how many records every poll asks for", async () => {
		const { fake, consumer } = createRunner({
			config: { maxRecordsPerPoll: 5_000 },
		});
		await consumer.connect();
		await consumer.subscribe({ topics: [topic] });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.consumeCounts.length >= 2);
		expect([...new Set(fake.consumeCounts)]).toEqual([5_000]);
		await consumer.disconnect();
	});

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

	test("a batch whose fetch ends past its last record spans the markers after it, as kafkajs's lastOffset did", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 5 },
			{ kind: "eof", partition: 0, offset: 8 },
		]);
		const batches: { offsets: string[]; last: string }[] = [];
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch, resolveOffset, uncommittedOffsets }) => {
				batches.push({
					offsets: batch.messages.map((m) => m.offset),
					last: batch.lastOffset(),
				});
				resolveOffset(batch.lastOffset());
				expect(uncommittedOffsets().topics[0]?.partitions).toEqual([
					{ partition: 0, offset: "8" },
				]);
			},
		});
		await until(() => events.some((e) => e.startsWith("end:")));
		await Bun.sleep(20);
		expect(batches).toEqual([{ offsets: ["5"], last: "7" }]);
		expect(events.filter((e) => e.startsWith("end:"))).toEqual(["end:0:1:7"]);
		await consumer.disconnect();
	});

	test.each([
		{ batchByPartition: undefined, expected: [["5"], ["8"]] },
		{ batchByPartition: false, expected: [["5"], ["8"]] },
		{ batchByPartition: true, expected: [["5", "8"]] },
	])(
		"batchByPartition=$batchByPartition controls batching across fetch ends without changing marker commits",
		async ({ batchByPartition, expected }) => {
			const { fake, consumer, events } = createRunner({
				config: { batchByPartition },
			});
			fake.chunks.push([
				{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
				{ kind: "message", partition: 0, offset: 5 },
				{ kind: "eof", partition: 0, offset: 8 },
				{ kind: "message", partition: 0, offset: 8 },
				{ kind: "eof", partition: 0, offset: 12 },
			]);
			const batches: string[][] = [];
			await consumer.connect();
			await consumer.subscribe({ topics: [topic], fromBeginning: true });
			await consumer.run({
				eachBatch: async ({
					batch,
					resolveOffset,
					commitOffsetsIfNecessary,
				}) => {
					batches.push(batch.messages.map((message) => message.offset));
					resolveOffset(batch.lastOffset());
					await commitOffsetsIfNecessary();
				},
			});
			await until(
				() => events.includes("end:0:1:11") || events.includes("end:0:2:11"),
			);
			expect(batches).toEqual(expected.map((offsets) => [...offsets]));
			expect(fake.commits.at(-1)).toEqual([
				{ topic, partition: 0, offset: 12 },
			]);
			await consumer.disconnect();
		},
	);

	test("markers fetched on their own are committed past once the handler has settled what came before", async () => {
		const { fake, consumer, events } = createRunner();
		fake.chunks.push(
			[
				{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
				{ kind: "message", partition: 0, offset: 5 },
			],
			[{ kind: "eof", partition: 0, offset: 8 }],
			[{ kind: "eof", partition: 0, offset: 8 }],
		);
		const batches: string[][] = [];
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary }) => {
				batches.push(batch.messages.map((m) => m.offset));
				resolveOffset(batch.lastOffset());
				await commitOffsetsIfNecessary();
			},
		});
		await until(() => fake.commits.length === 2);
		await Bun.sleep(20);
		expect(batches).toEqual([["5"]]);
		expect(fake.commits.map((c) => c.map((o) => o.offset))).toEqual([[6], [8]]);
		expect([...new Set(events.filter((e) => e.startsWith("end:")))]).toEqual([
			"end:0:1:5",
			"end:0:0:7",
		]);
		await consumer.disconnect();
	});

	test("markers after records the handler has not committed are left for its own commit", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push(
			[
				{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
				{ kind: "message", partition: 0, offset: 5 },
			],
			[{ kind: "eof", partition: 0, offset: 8 }],
		);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.chunks.length === 0);
		await Bun.sleep(20);
		expect(fake.commits).toEqual([]);
		await consumer.disconnect();
	});

	test("an end past records handed out but never resolved commits nothing past them", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push(
			[
				{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
				{ kind: "message", partition: 0, offset: 5 },
			],
			[{ kind: "message", partition: 0, offset: 6 }],
			[{ kind: "eof", partition: 0, offset: 9 }],
		);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatchAutoResolve: false,
			eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary }) => {
				if (batch.messages[0]?.offset !== "5") return;
				resolveOffset("5");
				await commitOffsetsIfNecessary();
			},
		});
		await until(() => fake.chunks.length === 0);
		await Bun.sleep(20);
		expect(fake.commits.map((c) => c.map((o) => o.offset))).toEqual([[6]]);
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
	test("a fetch is reported only once every assigned partition has had a fetch answered", async () => {
		const { fake, consumer } = createRunner();
		const fetches: number[] = [];
		consumer.on(consumer.events.FETCH, () => fetches.push(fetches.length));
		fake.chunks.push(
			[],
			[{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) }],
			[],
			[{ kind: "eof", partition: 0, offset: 12 }],
			[],
			[{ kind: "message", partition: 1, offset: 0 }],
		);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: false });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.chunks.length === 1);
		expect(fetches).toEqual([]);
		await until(() => fetches.length > 0);
		await consumer.disconnect();
	});
	test("a seek librdkafka drops as outdated is asked for again, unless a newer seek replaced it", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: false });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.assignments.length > 0);
		const outdated = () => Object.assign(new Error("outdated"), { code: -167 });

		fake.seekOutcomes.push(outdated());
		consumer.seek({ topic, partition: 0, offset: "0" });
		consumer.pause([{ topic, partitions: [0] }]);
		await until(() => fake.seeks.length === 2);
		expect(fake.seeks).toEqual([
			{ topic, partition: 0, offset: 0 },
			{ topic, partition: 0, offset: 0 },
		]);

		fake.seekOutcomes.push(outdated());
		consumer.seek({ topic, partition: 1, offset: "5" });
		consumer.seek({ topic, partition: 1, offset: "9" });
		await Bun.sleep(20);
		expect(fake.seeks.slice(2)).toEqual([
			{ topic, partition: 1, offset: 5 },
			{ topic, partition: 1, offset: 9 },
		]);
		await consumer.disconnect();
	});

	// After a leader move librdkafka caches -1 from the failed fetch response; kafkajs never reported one.
	test("a watermark librdkafka lost to a failed fetch never reads below what was delivered", async () => {
		const { fake, consumer } = createRunner();
		fake.watermark.highOffset = -1;
		const watermarks: string[] = [];
		consumer.on(consumer.events.END_BATCH_PROCESS, (event) =>
			watermarks.push(
				`${event.payload.batchSize}:${event.payload.highWatermark}`,
			),
		);
		fake.chunks.push(
			[
				{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) },
				{ kind: "message", partition: 0, offset: 7 },
				{ kind: "message", partition: 0, offset: 8 },
			],
			[{ kind: "eof", partition: 1, offset: 12 }],
		);
		const seen: string[] = [];
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch }) => {
				seen.push(batch.highWatermark);
			},
		});
		await until(() => watermarks.length >= 2);
		expect(seen).toEqual(["9"]);
		expect(watermarks).toEqual(["2:9", "0:12"]);
		await consumer.disconnect();
	});

	test("a cached watermark past the delivered position is reported as it is", async () => {
		const { fake, consumer } = createRunner();
		fake.watermark.highOffset = 500;
		const seen: string[] = [];
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 7 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch }) => {
				seen.push(batch.highWatermark);
			},
		});
		await until(() => seen.length > 0);
		expect(seen).toEqual(["500"]);
		await consumer.disconnect();
	});

	test("a consumer restarted after giving up joins on a new native client and closes the old one", async () => {
		const first = createFakeNative();
		const second = createFakeNative();
		const natives = [first, second];
		let created = 0;
		const consumer = createLibrdkafkaConsumer({
			ctx: {
				createNative: (config) => {
					const fake = natives[created++];
					if (!fake) throw new Error("no more natives");
					return fake.factory(config);
				},
				nativeClientConfig: {},
				log: createKafkaLog({
					clientId: "t",
					sink: {
						error: () => {},
						warn: () => {},
						info: () => {},
						debug: () => {},
					},
				}),
			},
			config: { groupId: "g", retry: { initialRetryTime: 1 } },
		});
		const crashes: boolean[] = [];
		consumer.on(consumer.events.CRASH, (event) =>
			crashes.push(event.payload.restart),
		);
		const joins: string[] = [];
		consumer.on(consumer.events.GROUP_JOIN, (event) =>
			joins.push((event.payload.memberAssignment[topic] ?? []).join(",")),
		);
		first.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{
				kind: "error",
				error: Object.assign(new Error("Local: Fatal error"), {
					code: -150,
					isFatal: true,
				}),
			},
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => crashes.length > 0);
		expect(crashes).toEqual([false]);

		second.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0, 1) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => joins.includes("0,1"));
		expect(created).toBe(2);
		expect(first.calls).toContain("disconnect");
		expect(second.calls).toContain(`subscribe:${topic}`);
		expect(second.calls).not.toContain("disconnect");
		await consumer.disconnect();
		expect(second.calls.at(-1)).toBe("disconnect");
	});

	test("a closing client's revocation never reaches the runner that replaced it", async () => {
		const first = createFakeNative();
		const second = createFakeNative();
		const natives = [first, second];
		let created = 0;
		const consumer = createLibrdkafkaConsumer({
			ctx: {
				createNative: (config) =>
					(natives[created++] as typeof first).factory(config),
				nativeClientConfig: {},
				log: createKafkaLog({
					clientId: "t",
					sink: {
						error: () => {},
						warn: () => {},
						info: () => {},
						debug: () => {},
					},
				}),
			},
			config: {
				groupId: "g",
				retry: { initialRetryTime: 1, restartOnFailure: async () => false },
			},
		});
		const joins: string[] = [];
		consumer.on(consumer.events.GROUP_JOIN, (event) =>
			joins.push((event.payload.memberAssignment[topic] ?? []).join(",")),
		);
		first.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 1 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async () => {
				throw new Error("handler failed");
			},
		});
		await until(() => first.calls.length > 0 && joins.length > 0);
		await Bun.sleep(30);
		second.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
		]);
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => joins.length >= 2);
		// The old client's late revocation of partition 0, after the new client was handed it.
		first.native.unsubscribe();
		first.native.consume(1, () => {});
		await Bun.sleep(20);
		expect(joins.at(-1)).toBe("0");
		await consumer.disconnect();
	});

	// Herald reads a stall from fetches going quiet; an empty poll every 5ms is no news from a broker.
	test("an empty or failed poll is never reported as a fetch", async () => {
		const { fake, consumer } = createRunner();
		const fetches: number[] = [];
		consumer.on(consumer.events.FETCH, (event) =>
			fetches.push(event.payload.numberOfBatches),
		);
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 3 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fetches.length > 0);
		const transportFailure = Object.assign(
			new Error("Local: Broker transport failure"),
			{
				code: -195,
			},
		);
		fake.chunks.push([], [{ kind: "error", error: transportFailure }], [], []);
		await until(() => fake.chunks.length === 0);
		await Bun.sleep(30);
		expect(fetches).toEqual([1]);
		await consumer.disconnect();
	});

	function statistics({
		fetches,
		rxidleMicros = 100_000,
		fetchState = "active",
	}: {
		fetches: number;
		rxidleMicros?: number;
		fetchState?: string;
	}): { message: string } {
		return {
			message: JSON.stringify({
				brokers: {
					"b1:9092/1": {
						nodeid: 1,
						rxidle: rxidleMicros,
						req: { Fetch: fetches },
					},
				},
				topics: {
					[topic]: {
						partitions: {
							"0": { partition: 0, leader: 1, fetch_state: fetchState },
							"-1": { partition: -1, leader: -1, fetch_state: "none" },
						},
					},
				},
			}),
		};
	}

	test("an idle consumer reports a fetch when statistics show its leaders answering fetches", async () => {
		const { fake, consumer } = createRunner({
			config: { statisticsIntervalMs: 1_000 },
		});
		const fetches: number[] = [];
		consumer.on(consumer.events.FETCH, (event) =>
			fetches.push(event.payload.numberOfBatches),
		);
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "eof", partition: 0, offset: 5 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fetches.length === 1);

		fake.emit("event.stats", statistics({ fetches: 10 }));
		expect(fetches).toHaveLength(1);
		fake.emit("event.stats", statistics({ fetches: 12 }));
		expect(fetches).toEqual([1, 0]);
		// A stalled broker: no new fetch went out, so none came back.
		fake.emit("event.stats", statistics({ fetches: 12 }));
		// A fetch that ended in a socket timeout, long after the last receive.
		fake.emit(
			"event.stats",
			statistics({ fetches: 13, rxidleMicros: 30_000_000 }),
		);
		fake.emit(
			"event.stats",
			statistics({ fetches: 14, fetchState: "offset-query" }),
		);
		expect(fetches).toEqual([1, 0]);
		await consumer.disconnect();
	});

	// A poll in flight may hold records from before a seek made meanwhile; delivering them would skip the seek.
	test("records a poll returns after a seek made while it ran are dropped and the seek asked for again", async () => {
		const { fake, consumer } = createRunner();
		const delivered: string[] = [];
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ batch }) => {
				delivered.push(...batch.messages.map((m) => m.offset));
			},
		});
		await until(() => fake.assignments.length > 0);
		const release = Promise.withResolvers<void>();
		fake.gate.held = release.promise;
		await until(() => fake.gate.held === undefined);
		consumer.seek({ topic, partition: 0, offset: "0" });
		fake.chunks.push([{ kind: "message", partition: 0, offset: 100 }]);
		release.resolve();
		await until(() => fake.seeks.length >= 2);
		fake.chunks.push([{ kind: "message", partition: 0, offset: 0 }]);
		await until(() => delivered.length > 0);
		expect(delivered).toEqual(["0"]);
		expect(fake.seeks).toEqual([
			{ topic, partition: 0, offset: 0 },
			{ topic, partition: 0, offset: 0 },
		]);
		await consumer.disconnect();
	});

	test("a batch whose partition was sought while it ran is stale, so nothing it resolves is committed", async () => {
		const { fake, consumer } = createRunner();
		let stale: boolean | undefined;
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 5 },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatchAutoResolve: false,
			eachBatch: async (payload) => {
				consumer.seek({ topic, partition: 0, offset: "100" });
				payload.resolveOffset("5");
				stale = payload.isStale();
				await payload.commitOffsetsIfNecessary();
			},
		});
		await until(() => stale !== undefined);
		expect(stale).toBe(true);
		expect(fake.commits).toEqual([]);
		await consumer.disconnect();
	});

	test("a restart waits for the committed offsets instead of resuming past the failed batch", async () => {
		const { fake, consumer, events } = createRunner();
		fake.committed.set("0", 7);
		fake.committedOutcomes.push(
			Object.assign(new Error("Local: Timed out"), { code: -185 }),
		);
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 7 },
		]);
		let failures = 0;
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async () => {
				failures += 1;
				if (failures === 1) throw new Error("handler failed");
			},
		});
		await until(() => events.includes("crash:true"));
		await until(() => fake.seeks.length > 0);
		expect(fake.seeks[0]).toEqual({ topic, partition: 0, offset: 7 });
		await consumer.disconnect();
	});

	// librdkafka evicts a member that stops polling for max.poll.interval.ms, heartbeats or not.
	test("a heartbeat past the poll interval reports the lease lost and the consumer rewinds to its commit", async () => {
		const { fake, consumer, events } = createRunner({
			config: { rebalanceTimeout: 60 },
		});
		fake.committed.set("0", 3);
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			{ kind: "message", partition: 0, offset: 3 },
		]);
		let heartbeatError: unknown;
		let calls = 0;
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			eachBatch: async ({ heartbeat }) => {
				calls += 1;
				if (calls > 1) return;
				await heartbeat();
				await Bun.sleep(80);
				try {
					await heartbeat();
				} catch (cause) {
					heartbeatError = cause;
				}
			},
		});
		await until(() => events.includes("crash:true"));
		expect(heartbeatError).toBeInstanceOf(KafkaConsumerLeaseLostError);
		await until(() => fake.seeks.length > 0);
		expect(fake.seeks[0]).toEqual({ topic, partition: 0, offset: 3 });
		await consumer.disconnect();
	});

	// A seek runs on a native pool thread; freeing the client under it is a use-after-free.
	test("disconnect waits for a seek still running natively before closing the client", async () => {
		const { fake, consumer } = createRunner();
		fake.chunks.push([
			{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
		]);
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({ eachBatch: async () => {} });
		await until(() => fake.assignments.length > 0);
		const seekDone = Promise.withResolvers<void>();
		fake.gate.seek = seekDone.promise;
		consumer.seek({ topic, partition: 0, offset: "4" });
		const closing = consumer.disconnect();
		await Bun.sleep(30);
		expect(fake.calls).not.toContain("disconnect");
		seekDone.resolve();
		await closing;
		expect(fake.calls.indexOf("seeked")).toBeLessThan(
			fake.calls.indexOf("disconnect"),
		);
	});
});

describe("group protocol", () => {
	async function nativeGroupConfigOf({
		groupProtocol,
		config,
	}: {
		groupProtocol?: GroupProtocol;
		config: ConsumerConfig;
	}): Promise<Record<string, unknown>> {
		const fake = createFakeNative();
		let global: Record<string, unknown> = {};
		const consumer = createLibrdkafkaConsumer({
			ctx: {
				createNative: (native) => {
					global = native.global;
					return fake.factory(native);
				},
				nativeClientConfig: {},
				log: createKafkaLog({
					clientId: "t",
					sink: {
						error: () => {},
						warn: () => {},
						info: () => {},
						debug: () => {},
					},
				}),
				groupProtocol,
			},
			config,
		});
		await consumer.connect();
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.disconnect();
		return global;
	}
	const groupConfig = createConsumerGroupConfig({
		groupId: "g",
		timings: {
			fetchMaxWaitTimeMs: 250,
			heartbeatIntervalMs: 3_000,
			rebalanceTimeoutMs: 60_000,
			sessionTimeoutMs: 30_000,
		},
		remoteAssignor: "range",
	});

	test("a group speaks KIP-848 with the broker's assignor unless its client says otherwise", async () => {
		const global = await nativeGroupConfigOf({ config: groupConfig });
		expect(global["group.protocol"]).toBe("consumer");
		expect(global["group.remote.assignor"]).toBe("range");
		expect(global["partition.assignment.strategy"]).toBeUndefined();
	});

	test("a classic client's groups join the classic way, dealt by librdkafka's own range", async () => {
		const global = await nativeGroupConfigOf({
			groupProtocol: "classic",
			config: groupConfig,
		});
		expect(global["group.protocol"]).toBe("classic");
		expect(global["partition.assignment.strategy"]).toBe("range");
		expect(global["session.timeout.ms"]).toBe(30_000);
		expect(global["group.remote.assignor"]).toBeUndefined();
	});

	test("a consumer that names its own protocol keeps it", async () => {
		const global = await nativeGroupConfigOf({
			groupProtocol: "classic",
			config: { ...groupConfig, groupProtocol: "consumer" },
		});
		expect(global["group.protocol"]).toBe("consumer");
	});
	// A stopping worker sat out the loop's waits; a SIGTERM must not wait for a restart's backoff to run out.
	test("stop wakes the loop from a restart backoff instead of waiting it out", async () => {
		const { fake, consumer, events } = createRunner({
			config: { retry: { initialRetryTime: 60_000 } },
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
		await until(() => events.includes("crash:true"));
		const startedAt = performance.now();
		await consumer.disconnect();
		expect(performance.now() - startedAt).toBeLessThan(1_000);
		expect(fake.calls).toContain("disconnect");
	});

	// Seen in soak: SIGTERM'd workers whose consume loop never noticed the stop held the process and the group for minutes.
	test(
		"stop leaves the group and closes the client even when the loop never answers",
		async () => {
			const { fake, consumer, logs } = createRunner();
			fake.chunks.push([
				{ kind: "rebalance", code: ASSIGN, partitions: partitions(0) },
			]);
			await consumer.connect();
			await consumer.subscribe({ topics: [topic], fromBeginning: true });
			await consumer.run({ eachBatch: async () => {} });
			await until(() => fake.assignments.length > 0);
			fake.gate.held = new Promise<void>(() => {});
			await until(() => fake.gate.held === undefined);
			const startedAt = performance.now();
			await consumer.disconnect();
			const tookMs = performance.now() - startedAt;
			expect(tookMs).toBeGreaterThanOrEqual(STOP_LOOP_TIMEOUT_MS - 50);
			expect(tookMs).toBeLessThan(STOP_LOOP_TIMEOUT_MS + 6_000);
			expect(fake.calls).toContain("unsubscribe");
			expect(fake.calls.at(-1)).toBe("disconnect");
			expect(logs.some((line) => line.includes("loop did not stop"))).toBe(
				true,
			);
		},
		{ timeout: STOP_LOOP_TIMEOUT_MS + 10_000 },
	);
	// A stop's bound must not outlive it: a pending timer kept every stopping worker alive for the full bound.
	test("a stopped consumer leaves nothing that holds the process open", async () => {
		const child = Bun.spawn(
			[
				"bun",
				new URL("./fixtures/consumerStopExits.ts", import.meta.url).pathname,
			],
			{ stdout: "pipe", stderr: "inherit" },
		);
		const output = await new Response(child.stdout).text();
		const stoppedAt = Number(/stopped (\d+)/.exec(output)?.[1]);
		await child.exited;
		expect(child.exitCode).toBe(0);
		expect(Date.now() - stoppedAt).toBeLessThan(2_000);
	});
});
