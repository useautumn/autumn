import { expect, test } from "bun:test";
import { createProgressTracker, type KafkaConsumerClient } from "@autumn/kafka";
import { createMeteringConsumer } from "../../../../../src/kafka/meteringConsumer/createMeteringConsumer.js";
import {
	closeStoreFixture,
	createStoreFixture,
	topic,
} from "../../kafka-test-fixtures.js";

function createLifecycleFixture({
	startFailure,
	stopFailure,
	disconnectFailure,
}: {
	startFailure?: Error;
	stopFailure?: Error;
	disconnectFailure?: Error;
} = {}) {
	const fixture = createStoreFixture();
	const events: string[] = [];
	const listeners = new Set<unknown>();
	function on(_event: string, listener: unknown) {
		listeners.add(listener);
		function unsubscribe(): void {
			listeners.delete(listener);
		}
		return unsubscribe;
	}
	async function connect(): Promise<void> {
		events.push("connect");
	}
	async function subscribe(): Promise<void> {
		events.push("subscribe");
	}
	async function run(): Promise<void> {
		events.push("run");
		if (startFailure) throw startFailure;
	}
	async function stop(): Promise<void> {
		events.push("stop");
		if (stopFailure) throw stopFailure;
	}
	async function disconnect(): Promise<void> {
		events.push("disconnect");
		if (disconnectFailure) throw disconnectFailure;
	}
	async function commitOffsets(): Promise<void> {}
	function seek(): void {}
	function pause(): void {}
	function resume(): void {}
	async function fetchTopicOffsets() {
		return [];
	}
	function close(): void {
		closeStoreFixture(fixture);
	}
	const kafka: KafkaConsumerClient = {
		connect,
		subscribe,
		run,
		stop,
		disconnect,
		commitOffsets,
		seek,
		pause,
		resume,
		events: {
			GROUP_JOIN: "consumer.group_join",
			END_BATCH_PROCESS: "consumer.end_batch_process",
		} as KafkaConsumerClient["events"],
		on: on as KafkaConsumerClient["on"],
	};
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: kafka,
			partitionOffsets: { fetchTopicOffsets },
			stateStore: fixture.store,
			positionTracker: createProgressTracker(),
		},
		config: { topic },
	});
	return { consumer, events, listeners, close };
}

async function startupFailureCleansUp(): Promise<void> {
	const startFailure = new Error("run failed");
	const fixture = createLifecycleFixture({
		startFailure,
		disconnectFailure: new Error("disconnect failed"),
	});
	try {
		await expect(fixture.consumer.start()).rejects.toBe(startFailure);
		expect(fixture.listeners.size).toBe(0);
		expect(fixture.events).toEqual([
			"connect",
			"subscribe",
			"run",
			"disconnect",
		]);
	} finally {
		fixture.close();
	}
}

async function stopFailureStillDisconnects(): Promise<void> {
	const stopFailure = new Error("stop failed");
	const fixture = createLifecycleFixture({ stopFailure });
	try {
		await fixture.consumer.start();
		await expect(fixture.consumer.stop()).rejects.toBe(stopFailure);
		expect(fixture.listeners.size).toBe(0);
		expect(fixture.events).toEqual([
			"connect",
			"subscribe",
			"run",
			"stop",
			"disconnect",
		]);
		await fixture.consumer.stop();
		expect(fixture.events.length).toBe(5);
	} finally {
		fixture.close();
	}
}

test(
	"consumer startup cleanup preserves the startup error and removes listeners",
	startupFailureCleansUp,
);
test(
	"consumer shutdown disconnects and removes listeners even when stop fails",
	stopFailureStillDisconnects,
);
