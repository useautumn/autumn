import { describe, expect, spyOn, test } from "bun:test";
import type { ConsumerConfig, ConsumerRunConfig } from "kafkajs";
import type { KafkaConsumerClient } from "../../src/consumer/types/consumer.js";
import { createOwnershipTail } from "../../src/topics/ownership/consumer/createOwnershipTail.js";
import type { OwnershipTailRecord } from "../../src/topics/ownership/consumer/types/ownershipTail.js";
import { ownershipTopic } from "../../src/topics/ownership/ownershipTopic.js";
import type { OwnershipRecord } from "../../src/topics/ownership/types/ownershipRecord.js";

const topic = "balance-partition-owners";

function createFakeTailKafka({
	connectGate,
}: {
	connectGate?: Promise<void>;
} = {}) {
	const listeners = new Map<string, Set<(event: unknown) => void>>();
	const lifecycle: string[] = [];
	let runConfig: ConsumerRunConfig | undefined;
	let groupConfig: ConsumerConfig | undefined;
	let subscription: { topics: string[]; fromBeginning?: boolean } | undefined;
	let running = false;

	async function connect(): Promise<void> {
		await connectGate;
		lifecycle.push("connect");
	}
	async function subscribe(params: {
		topics: string[];
		fromBeginning?: boolean;
	}): Promise<void> {
		subscription = params;
		lifecycle.push("subscribe");
	}
	async function run(config: ConsumerRunConfig = {}): Promise<void> {
		runConfig = config;
		running = true;
		lifecycle.push("run");
	}
	async function stop(): Promise<void> {
		running = false;
		lifecycle.push("stop");
	}
	async function disconnect(): Promise<void> {
		lifecycle.push("disconnect");
	}
	async function commitOffsets(): Promise<void> {}
	function seek(): void {}
	function pause(): void {}
	function resume(): void {}
	function on(event: string, listener: (event: unknown) => void): () => void {
		const pending = listeners.get(event) ?? new Set();
		pending.add(listener);
		listeners.set(event, pending);
		function remove(): void {
			pending.delete(listener);
		}
		return remove;
	}
	function emit({ event, payload }: { event: string; payload: unknown }): void {
		for (const listener of listeners.get(event) ?? []) listener({ payload });
	}
	function fetched(): void {
		emit({ event: "fetch", payload: { numberOfBatches: 0, duration: 1 } });
	}
	function crash(error: Error): void {
		emit({
			event: "crash",
			payload: { error, groupId: "tail", restart: true },
		});
	}
	const consumerClient = {
		connect,
		subscribe,
		run,
		stop,
		disconnect,
		commitOffsets,
		seek,
		pause,
		resume,
		on: on as KafkaConsumerClient["on"],
		events: {
			GROUP_JOIN: "join",
			END_BATCH_PROCESS: "batch",
			CRASH: "crash",
			FETCH: "fetch",
		} as unknown as KafkaConsumerClient["events"],
	};
	function consumer(config: ConsumerConfig) {
		groupConfig = config;
		return consumerClient;
	}
	async function deliver({
		partition,
		messages,
		stale = false,
	}: {
		partition: number;
		messages: { offset: bigint; key: Buffer | null; value: Buffer | null }[];
		stale?: boolean;
	}): Promise<string[]> {
		if (!runConfig?.eachBatch) throw new Error("Missing batch handler");
		const resolved: string[] = [];
		function resolveOffset(offset: string): void {
			resolved.push(offset);
		}
		async function heartbeat(): Promise<void> {}
		function isRunning(): boolean {
			return running;
		}
		function isStale(): boolean {
			return stale;
		}
		function firstOffset(): string | null {
			return messages[0]?.offset.toString() ?? null;
		}
		function lastOffset(): string {
			return messages.at(-1)?.offset.toString() ?? "-1";
		}
		function isEmpty(): boolean {
			return messages.length === 0;
		}
		function offsetLag(): string {
			return "0";
		}
		function pauseBatch(): () => void {
			return resume;
		}
		function uncommittedOffsets() {
			return { topics: [] };
		}
		await runConfig.eachBatch({
			batch: {
				topic,
				partition,
				highWatermark: lastOffset(),
				messages: messages.map(function toMessage(message) {
					return {
						key: message.key,
						value: message.value,
						offset: message.offset.toString(),
						timestamp: "0",
						attributes: 0,
						headers: {},
					};
				}),
				firstOffset,
				lastOffset,
				isEmpty,
				offsetLag,
				offsetLagLow: offsetLag,
			},
			resolveOffset,
			heartbeat,
			pause: pauseBatch,
			uncommittedOffsets,
			commitOffsetsIfNecessary: commitOffsets,
			isRunning,
			isStale,
		});
		return resolved;
	}
	function readSubscription() {
		return { subscription, groupConfig, lifecycle };
	}
	return { kafka: { consumer }, fetched, crash, deliver, readSubscription };
}

function serialized({
	record,
	offset,
}: {
	record: OwnershipRecord;
	offset: bigint;
}) {
	return { offset, ...ownershipTopic.serialize({ record }) };
}

const ready: OwnershipRecord = {
	schemaVersion: 1,
	type: "ready",
	partition: 3,
	endpoint: "http://successor:8080",
	readyAt: 1,
};
const claimed: OwnershipRecord = {
	schemaVersion: 1,
	type: "claimed",
	partition: 3,
	endpoint: "http://successor:8080",
	claimedAt: 2,
};

async function startTail(fixture: ReturnType<typeof createFakeTailKafka>) {
	const errors: unknown[] = [];
	function onError({ cause }: { cause: unknown }): void {
		errors.push(cause);
	}
	const tail = createOwnershipTail({
		ctx: { kafka: fixture.kafka, onError },
		config: { topic, startTimeoutMs: 1_000 },
	});
	const starting = tail.start();
	await Promise.resolve();
	fixture.fetched();
	await starting;
	return { tail, errors };
}

describe("ownershipTail", function ownershipTailTests() {
	test("starts one consumer at the log end and settles after the first fetch", async () => {
		const fixture = createFakeTailKafka();
		const { tail } = await startTail(fixture);
		try {
			const { subscription, groupConfig, lifecycle } =
				fixture.readSubscription();
			expect(subscription).toEqual({ topics: [topic], fromBeginning: false });
			expect(groupConfig).toMatchObject({
				readUncommitted: false,
				allowAutoTopicCreation: false,
			});
			expect(groupConfig?.groupId).toStartWith("autumn-ownership-tail-");
			expect(lifecycle).toEqual(["connect", "subscribe", "run"]);
		} finally {
			await tail.stop();
		}
		expect(fixture.readSubscription().lifecycle).toEqual([
			"connect",
			"subscribe",
			"run",
			"stop",
			"disconnect",
		]);
	});

	test("start fails when nothing is fetched in time", async () => {
		const fixture = createFakeTailKafka();
		const tail = createOwnershipTail({
			ctx: { kafka: fixture.kafka },
			config: { topic, startTimeoutMs: 5 },
		});
		await expect(tail.start()).rejects.toThrow("did not fetch");
		expect(fixture.readSubscription().lifecycle).toContain("disconnect");
	});

	test("a start timeout that fires during connect is not an unhandled rejection", async () => {
		const connected = Promise.withResolvers<void>();
		const fixture = createFakeTailKafka({ connectGate: connected.promise });
		const tail = createOwnershipTail({
			ctx: { kafka: fixture.kafka },
			config: { topic, startTimeoutMs: 5 },
		});
		const unhandled: unknown[] = [];
		function onUnhandled(reason: unknown): void {
			unhandled.push(reason);
		}
		process.on("unhandledRejection", onUnhandled);
		try {
			const starting = tail.start();
			await Bun.sleep(20);
			connected.resolve();
			await expect(starting).rejects.toThrow("did not fetch");
			await Bun.sleep(5);
			expect(unhandled).toEqual([]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	test("a stop that lands while start awaits the first fetch wins", async () => {
		const fixture = createFakeTailKafka();
		const tail = createOwnershipTail({
			ctx: { kafka: fixture.kafka },
			config: { topic, startTimeoutMs: 1_000 },
		});
		const starting = tail.start();
		while (!fixture.readSubscription().lifecycle.includes("run"))
			await Promise.resolve();
		// The fetch has been observed but start has not resumed yet when stop runs.
		fixture.fetched();
		const stopping = tail.stop();
		await starting;
		await stopping;
		function follow(): void {
			tail.tailPartition({
				partition: 3,
				onRecord: () => undefined,
				signal: new AbortController().signal,
			});
		}
		expect(follow).toThrow("stopped");
		expect(fixture.readSubscription().lifecycle).toEqual([
			"connect",
			"subscribe",
			"run",
			"stop",
			"disconnect",
		]);
	});

	test("delivers a partition's records in order to its listeners only", async () => {
		const fixture = createFakeTailKafka();
		const { tail, errors } = await startTail(fixture);
		try {
			const seen: OwnershipTailRecord[] = [];
			const other: OwnershipTailRecord[] = [];
			const controller = new AbortController();
			function onRecord(entry: OwnershipTailRecord): void {
				seen.push(entry);
			}
			function onOther(entry: OwnershipTailRecord): void {
				other.push(entry);
			}
			tail.tailPartition({
				partition: 3,
				onRecord,
				signal: controller.signal,
			});
			tail.tailPartition({
				partition: 4,
				onRecord: onOther,
				signal: controller.signal,
			});

			const resolved = await fixture.deliver({
				partition: 3,
				messages: [
					serialized({ record: ready, offset: 10n }),
					serialized({ record: claimed, offset: 11n }),
				],
			});

			expect(resolved).toEqual(["10", "11"]);
			expect(seen).toEqual([
				{ partition: 3, offset: 10n, record: ready },
				{ partition: 3, offset: 11n, record: claimed },
			]);
			expect(other).toEqual([]);
			expect(errors).toEqual([]);
		} finally {
			await tail.stop();
		}
	});

	test("an aborted listener hears nothing more; the others keep hearing", async () => {
		const fixture = createFakeTailKafka();
		const { tail } = await startTail(fixture);
		try {
			const first: bigint[] = [];
			const second: bigint[] = [];
			const firstController = new AbortController();
			const secondController = new AbortController();
			function onFirst({ offset }: OwnershipTailRecord): void {
				first.push(offset);
			}
			function onSecond({ offset }: OwnershipTailRecord): void {
				second.push(offset);
			}
			tail.tailPartition({
				partition: 3,
				onRecord: onFirst,
				signal: firstController.signal,
			});
			tail.tailPartition({
				partition: 3,
				onRecord: onSecond,
				signal: secondController.signal,
			});
			await fixture.deliver({
				partition: 3,
				messages: [serialized({ record: ready, offset: 1n })],
			});
			firstController.abort();
			await fixture.deliver({
				partition: 3,
				messages: [serialized({ record: claimed, offset: 2n })],
			});

			expect(first).toEqual([1n]);
			expect(second).toEqual([1n, 2n]);
			const aborted = new AbortController();
			aborted.abort();
			tail.tailPartition({
				partition: 3,
				onRecord: onFirst,
				signal: aborted.signal,
			});
			await fixture.deliver({
				partition: 3,
				messages: [serialized({ record: claimed, offset: 3n })],
			});
			expect(first).toEqual([1n]);
		} finally {
			await tail.stop();
		}
	});

	test("stop removes the abort listeners it put on callers' signals", async () => {
		const fixture = createFakeTailKafka();
		const { tail } = await startTail(fixture);
		const controller = new AbortController();
		const removed = spyOn(controller.signal, "removeEventListener");
		tail.tailPartition({
			partition: 3,
			onRecord: () => undefined,
			signal: controller.signal,
		});
		tail.tailPartition({
			partition: 4,
			onRecord: () => undefined,
			signal: controller.signal,
		});
		await tail.stop();
		expect(removed).toHaveBeenCalledTimes(2);
		expect(removed.mock.calls.map(([type]) => type)).toEqual([
			"abort",
			"abort",
		]);
		// A listener that ended on its own signal is detached once, not again at stop.
		const second = createFakeTailKafka();
		const started = await startTail(second);
		const own = new AbortController();
		const ownRemoved = spyOn(own.signal, "removeEventListener");
		started.tail.tailPartition({
			partition: 3,
			onRecord: () => undefined,
			signal: own.signal,
		});
		own.abort();
		await started.tail.stop();
		expect(ownRemoved).toHaveBeenCalledTimes(1);
	});

	test("reports an unreadable record or a crash and keeps following", async () => {
		const fixture = createFakeTailKafka();
		const { tail, errors } = await startTail(fixture);
		try {
			const seen: bigint[] = [];
			const controller = new AbortController();
			function onRecord({ offset }: OwnershipTailRecord): void {
				seen.push(offset);
			}
			tail.tailPartition({
				partition: 3,
				onRecord,
				signal: controller.signal,
			});
			const resolved = await fixture.deliver({
				partition: 3,
				messages: [
					{ offset: 5n, key: Buffer.from("3"), value: Buffer.from("junk") },
					serialized({ record: claimed, offset: 6n }),
				],
			});
			const crashed = new Error("Consumer crashed");
			fixture.crash(crashed);

			expect(resolved).toEqual(["5", "6"]);
			expect(seen).toEqual([6n]);
			expect(errors).toHaveLength(2);
			expect(errors[1]).toBe(crashed);
		} finally {
			await tail.stop();
		}
	});

	test("refuses to follow before start or after stop", async () => {
		const fixture = createFakeTailKafka();
		const tail = createOwnershipTail({
			ctx: { kafka: fixture.kafka },
			config: { topic },
		});
		function follow(): void {
			tail.tailPartition({
				partition: 3,
				onRecord: () => undefined,
				signal: new AbortController().signal,
			});
		}
		expect(follow).toThrow("created");
		await tail.stop();
		expect(follow).toThrow("stopped");
		expect(fixture.readSubscription().lifecycle).toEqual([]);
	});
});
