test("waits for runtime quiescence before starting a replacement", async () => {
	const fixture = createStoreFixture();
	const consumer = createFakeGroupConsumer();
	const settling = Promise.withResolvers<void>();
	const started: number[] = [];
	let sequence = 0;
	const group = createKafkaOwnedPartitionGroup({
		consumer,
		partitionOffsets: createPartitionOffsets(),
		topic,
		stateStore: fixture.store,
		partitionsConsumedConcurrently: 1,
		createRuntime: () => {
			const id = ++sequence;
			return {
				start: async () => {
					started.push(id);
				},
				stop: async () => {},
				waitForQuiescence: async () => {
					if (id === 1) await settling.promise;
				},
			};
		},
		onError: () => {},
	});
	try {
		await group.start();
		consumer.emitGroupJoin([0]);
		await waitFor(() => started.length === 1);
		consumer.emitGroupJoin([0]);
		await new Promise<void>(setImmediate);
		expect(started).toEqual([1]);
		settling.resolve();
		await waitFor(() => started.length === 2);
		expect(started).toEqual([1, 2]);
	} finally {
		settling.resolve();
		await group.stop();
		closeStoreFixture(fixture);
	}
});

test("failed retirement stops the group without starting a replacement", async () => {
	const fixture = createStoreFixture();
	const consumer = createFakeGroupConsumer();
	const errors: unknown[] = [];
	const started: number[] = [];
	const failure = new Error("replay did not settle");
	const group = createKafkaOwnedPartitionGroup({
		consumer,
		partitionOffsets: createPartitionOffsets(),
		topic,
		stateStore: fixture.store,
		partitionsConsumedConcurrently: 1,
		createRuntime: () => ({
			start: async () => {
				started.push(0);
			},
			stop: async () => {},
			waitForQuiescence: async () => {
				throw failure;
			},
		}),
		onError: ({ cause }) => errors.push(cause),
	});
	try {
		await group.start();
		consumer.emitGroupJoin([0]);
		await waitFor(() => started.length === 1);
		consumer.emitGroupJoin([0]);
		await waitFor(() => consumer.lifecycle.includes("consumer-stop"));
		expect(started).toEqual([0]);
		expect(errors).toHaveLength(1);
		expect((errors[0] as AggregateError).errors).toEqual([failure]);
	} finally {
		await group.stop();
		closeStoreFixture(fixture);
	}
});

import { describe, expect, test } from "bun:test";
import { KafkaPartitionAssignmentRevokedError } from "@autumn/kafka";
import type {
	ConsumerCrashEvent,
	ConsumerGroupJoinEvent,
	ConsumerRebalancingEvent,
	ConsumerRunConfig,
} from "kafkajs";
import {
	closeStoreFixture,
	createKafkaOwnedPartitionGroup,
	createStoreFixture,
	type KafkaOwnedPartitionGroupConsumerPort,
	type KafkaPartitionRuntimeFactory,
	topic,
} from "./kafka-test-fixtures.js";

type Deferred = {
	promise: Promise<void>;
	resolve: () => void;
};

const createDeferred = (): Deferred => {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
};

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (condition()) return;
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Condition was not reached");
};

type FakeGroupConsumer = KafkaOwnedPartitionGroupConsumerPort & {
	lifecycle: string[];
	pauses: Array<{ topic: string; partitions?: number[] }>;
	resumes: Array<{ topic: string; partitions?: number[] }>;
	runConfig: ConsumerRunConfig | null;
	emitGroupJoin(partitions: number[]): void;
	emitRebalancing(): void;
	emitCrash(error: Error): void;
	failNextPause(error: Error): void;
};

const createFakeGroupConsumer = (): FakeGroupConsumer => {
	const listeners = new Map<string, Set<(event: unknown) => void>>();
	const lifecycle: string[] = [];
	const pauses: Array<{ topic: string; partitions?: number[] }> = [];
	const resumes: Array<{ topic: string; partitions?: number[] }> = [];
	let nextPauseError: Error | null = null;
	const emit = (eventName: string, event: unknown): void => {
		for (const listener of listeners.get(eventName) ?? []) listener(event);
	};
	const event = <Payload>(type: string, payload: Payload) => ({
		id: `${type}-1`,
		type,
		timestamp: Date.now(),
		payload,
	});

	return {
		lifecycle,
		pauses,
		resumes,
		runConfig: null,
		events: {
			GROUP_JOIN: "consumer.group_join",
			END_BATCH_PROCESS: "consumer.end_batch_process",
			REBALANCING: "consumer.rebalancing",
			CRASH: "consumer.crash",
		} as KafkaOwnedPartitionGroupConsumerPort["events"],
		on: ((eventName: string, listener: (event: unknown) => void) => {
			const eventListeners = listeners.get(eventName) ?? new Set();
			eventListeners.add(listener);
			listeners.set(eventName, eventListeners);
			return () => eventListeners.delete(listener);
		}) as KafkaOwnedPartitionGroupConsumerPort["on"],
		connect: async () => {
			lifecycle.push("consumer-connect");
		},
		subscribe: async () => {
			lifecycle.push("consumer-subscribe");
		},
		run: async function (config) {
			lifecycle.push("consumer-run");
			this.runConfig = config ?? null;
		},
		commitOffsets: async () => undefined,
		seek: () => undefined,
		pause: (topics) => {
			if (nextPauseError) {
				const error = nextPauseError;
				nextPauseError = null;
				throw error;
			}
			pauses.push(...topics);
		},
		resume: (topics) => {
			resumes.push(...topics);
		},
		stop: async () => {
			lifecycle.push("consumer-stop");
		},
		disconnect: async () => {
			lifecycle.push("consumer-disconnect");
		},
		emitGroupJoin: (partitions) => {
			emit(
				"consumer.group_join",
				event<ConsumerGroupJoinEvent["payload"]>("consumer.group_join", {
					duration: 1,
					groupId: "balance-workers",
					isLeader: true,
					leaderId: "worker-1",
					groupProtocol: "RoundRobinAssigner",
					memberId: "worker-1",
					memberAssignment: { [topic]: partitions },
				}),
			);
		},
		emitRebalancing: () => {
			emit(
				"consumer.rebalancing",
				event<ConsumerRebalancingEvent["payload"]>("consumer.rebalancing", {
					groupId: "balance-workers",
					memberId: "worker-1",
				}),
			);
		},
		emitCrash: (error) => {
			emit(
				"consumer.crash",
				event<ConsumerCrashEvent["payload"]>("consumer.crash", {
					error,
					groupId: "balance-workers",
					restart: true,
				}),
			);
		},
		failNextPause: (error) => {
			nextPauseError = error;
		},
	};
};

const createPartitionOffsets = () => {
	const lifecycle: string[] = [];
	return {
		lifecycle,
		connect: async () => {
			lifecycle.push("admin-connect");
		},
		disconnect: async () => {
			lifecycle.push("admin-disconnect");
		},
		fetchTopicOffsets: async () =>
			[0, 1, 2].map((partition) => ({
				partition,
				offset: "0",
				low: "0",
				high: "0",
			})),
	};
};

const initializePartitions = ({
	store,
}: {
	store: ReturnType<typeof createStoreFixture>["store"];
}): void => {
	store.initializePartition({ topic, partition: 1, nextOffset: 0n });
	store.initializePartition({ topic, partition: 2, nextOffset: 0n });
};

const createRuntimeFactory =
	({
		started,
		stopped,
		unavailable,
	}: {
		started: number[];
		stopped: number[];
		unavailable: unknown[];
	}): KafkaPartitionRuntimeFactory =>
	({ topic: runtimeTopic, partition, follower }) => ({
		start: async () => {
			started.push(partition);
			await follower.startAndCatchUp({
				topic: runtimeTopic,
				partition,
				onUnavailable: ({ cause }) => unavailable.push(cause),
			});
		},
		stop: async () => {
			stopped.push(partition);
			await follower.stop();
		},
	});

describe("Kafka owned partition group", () => {
	test("allows one partition to be consumed at a time", () => {
		const fixture = createStoreFixture();
		try {
			expect(() =>
				createKafkaOwnedPartitionGroup({
					consumer: createFakeGroupConsumer(),
					partitionOffsets: createPartitionOffsets(),
					topic,
					stateStore: fixture.store,
					partitionsConsumedConcurrently: 1,
					createRuntime: createRuntimeFactory({
						started: [],
						stopped: [],
						unavailable: [],
					}),
					onError: () => undefined,
				}),
			).not.toThrow();
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("creates one runtime per assigned partition over one concurrent consumer", async () => {
		const fixture = createStoreFixture();
		try {
			initializePartitions({ store: fixture.store });
			const consumer = createFakeGroupConsumer();
			const started: number[] = [];
			const errors: unknown[] = [];
			const partitionOffsets = createPartitionOffsets();
			const group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets,
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
				createRuntime: createRuntimeFactory({
					started,
					stopped: [],
					unavailable: [],
				}),
				onError: ({ cause }) => errors.push(cause),
			});

			await group.start();
			consumer.emitGroupJoin([1, 0]);
			await waitFor(() => started.length === 2);

			expect(started).toEqual([0, 1]);
			expect(consumer.runConfig).toMatchObject({
				partitionsConsumedConcurrently: 2,
			});
			expect(consumer.pauses[0]).toEqual({ topic, partitions: [0, 1] });
			expect(
				consumer.lifecycle.filter((step) => step === "consumer-connect"),
			).toHaveLength(1);
			expect(errors).toEqual([]);
			expect(partitionOffsets.lifecycle).toEqual(["admin-connect"]);
			await group.stop();
			expect(partitionOffsets.lifecycle).toEqual([
				"admin-connect",
				"admin-disconnect",
			]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("revokes every runtime and re-fences a retained partition", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createFakeGroupConsumer();
			const started: number[] = [];
			const stopped: number[] = [];
			const unavailable: unknown[] = [];
			const group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets: createPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
				createRuntime: createRuntimeFactory({
					started,
					stopped,
					unavailable,
				}),
				onError: () => undefined,
			});
			await group.start();
			consumer.emitGroupJoin([0]);
			await waitFor(() => started.length === 1);

			consumer.emitRebalancing();
			await waitFor(() => stopped.length === 1);
			consumer.emitGroupJoin([0]);
			await waitFor(() => started.length === 2);

			expect(started).toEqual([0, 0]);
			expect(stopped).toEqual([0]);
			expect(unavailable[0]).toBeInstanceOf(
				KafkaPartitionAssignmentRevokedError,
			);
			await group.stop();
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("keeps assignment startup safe when the tidiness pause fails", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createFakeGroupConsumer();
			const started: number[] = [];
			const errors: unknown[] = [];
			const group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets: createPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
				createRuntime: createRuntimeFactory({
					started,
					stopped: [],
					unavailable: [],
				}),
				onError: ({ cause }) => errors.push(cause),
			});
			await group.start();
			const pauseError = new Error("pause raced the assignment");
			consumer.failNextPause(pauseError);

			consumer.emitGroupJoin([0]);
			await waitFor(() => started.length === 1);

			expect(errors).toEqual([pauseError]);
			await group.stop();
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("starts only the newest assignment when generations overlap", async () => {
		const fixture = createStoreFixture();
		try {
			initializePartitions({ store: fixture.store });
			const consumer = createFakeGroupConsumer();
			const stopGate = createDeferred();
			const created: number[] = [];
			const started: number[] = [];
			let runtimeSequence = 0;
			const createRuntime: KafkaPartitionRuntimeFactory = ({ partition }) => {
				runtimeSequence += 1;
				const sequence = runtimeSequence;
				created.push(partition);
				return {
					start: async () => {
						started.push(partition);
					},
					stop: async () => {
						if (sequence === 1) await stopGate.promise;
					},
				};
			};
			const group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets: createPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
				createRuntime,
				onError: () => undefined,
			});
			await group.start();
			consumer.emitGroupJoin([0]);
			await waitFor(() => started.length === 1);

			consumer.emitRebalancing();
			consumer.emitGroupJoin([1]);
			consumer.emitGroupJoin([2]);
			stopGate.resolve();
			await waitFor(() => started.length === 2);

			expect(created).toEqual([0, 2]);
			expect(started).toEqual([0, 2]);
			await group.stop();
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("makes every owned partition unavailable when the consumer crashes", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createFakeGroupConsumer();
			const started: number[] = [];
			const stopped: number[] = [];
			const unavailable: unknown[] = [];
			const errors: unknown[] = [];
			const group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets: createPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
				createRuntime: createRuntimeFactory({
					started,
					stopped,
					unavailable,
				}),
				onError: ({ cause }) => errors.push(cause),
			});
			await group.start();
			consumer.emitGroupJoin([0]);
			await waitFor(() => started.length === 1);
			const crash = new Error("consumer crashed");

			consumer.emitCrash(crash);
			await waitFor(() => stopped.length === 1);

			expect(unavailable).toEqual([crash]);
			expect(errors).toEqual([crash]);
			await group.stop();
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("stops owned runtimes before stopping the shared consumer", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createFakeGroupConsumer();
			const stopGate = createDeferred();
			const lifecycle = consumer.lifecycle;
			const group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets: createPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
				createRuntime: () => ({
					start: async () => {
						lifecycle.push("runtime-start");
					},
					stop: async () => {
						lifecycle.push("runtime-stop-start");
						await stopGate.promise;
						lifecycle.push("runtime-stop-end");
					},
				}),
				onError: () => undefined,
			});
			await group.start();
			consumer.emitGroupJoin([0]);
			await waitFor(() => lifecycle.includes("runtime-start"));

			const stopping = group.stop();
			await waitFor(() => lifecycle.includes("runtime-stop-start"));
			expect(lifecycle).not.toContain("consumer-stop");

			stopGate.resolve();
			await stopping;
			expect(lifecycle.indexOf("runtime-stop-end")).toBeLessThan(
				lifecycle.indexOf("consumer-stop"),
			);
		} finally {
			closeStoreFixture(fixture);
		}
	});
});

import { readFileSync } from "node:fs";
import { Glob } from "bun";
import ts from "typescript";

function ownershipUsesNamedFunctions(): void {
	const directory = new URL("../../../src/", import.meta.url).pathname;
	const violations: string[] = [];
	for (const file of new Glob(
		"{partitions,init,kafka/meteringConsumer}/**/*.ts",
	).scanSync({
		cwd: directory,
		absolute: true,
	})) {
		const source = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const pending: ts.Node[] = [source];
		while (pending.length > 0) {
			const node = pending.pop();
			if (!node) continue;
			const anonymous =
				ts.isArrowFunction(node) ||
				ts.isFunctionExpression(node) ||
				(ts.isFunctionDeclaration(node) && !node.name);
			const inlineMethod =
				ts.isMethodDeclaration(node) &&
				ts.isObjectLiteralExpression(node.parent);
			const callbackWiring =
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				["bind", "then", "catch", "finally"].includes(
					node.expression.name.text,
				);
			if (anonymous || inlineMethod || callbackWiring) {
				const { line } = source.getLineAndCharacterOfPosition(
					node.getStart(source),
				);
				violations.push(
					`${file}:${line + 1}: ${node.getText(source).slice(0, 80)}`,
				);
			}
			pending.push(...node.getChildren(source));
		}
	}
	expect(violations).toEqual([]);
}

test(
	"partition ownership, construction and replay use named functions",
	ownershipUsesNamedFunctions,
);
