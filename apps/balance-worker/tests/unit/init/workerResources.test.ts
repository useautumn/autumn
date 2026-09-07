import { expect, test } from "bun:test";
import { Kafka } from "kafkajs";
import { createWorkerResources } from "../../../src/init/workerResources.js";
import {
	closeStoreFixture,
	createStoreFixture,
	topic,
} from "../kafka/kafka-test-fixtures.js";

function createResourceFixture() {
	const storeFixture = createStoreFixture();
	const events: string[] = [];
	const kafka = new Kafka({ brokers: ["127.0.0.1:19092"] });
	async function disconnect(): Promise<void> {
		events.push("disconnect");
	}
	async function fetchTopicOffsets() {
		return [];
	}
	function partitionForIdentity(): number {
		return 0;
	}
	const resources = createWorkerResources({
		ctx: {
			kafka,
			admin: { disconnect, fetchTopicOffsets },
			stateStore: storeFixture.store,
			partitionResolver: { partitionForIdentity },
		},
	});
	function close(): void {
		closeStoreFixture(storeFixture);
	}
	return { resources, events, close };
}

function createRuntimeResource({
	events,
	name,
	quiescence,
}: {
	events: string[];
	name: string;
	quiescence?: Promise<void>;
}) {
	async function stop(): Promise<void> {
		events.push(`${name}:stop`);
	}
	async function waitForQuiescence(): Promise<void> {
		events.push(`${name}:quiescence`);
		await quiescence;
	}
	return { name, stop, waitForQuiescence };
}

async function forgetsOnlySettledRuntimes(): Promise<void> {
	const fixture = createResourceFixture();
	try {
		const retired = fixture.resources.registerRuntime(
			createRuntimeResource({ events: fixture.events, name: "retired" }),
		);
		fixture.resources.registerRuntime(
			createRuntimeResource({ events: fixture.events, name: "active" }),
		);
		expect(retired.name).toBe("retired");
		const wait = retired.waitForQuiescence;
		await wait();
		const settle = fixture.resources.settleResources;
		await settle();
		expect(fixture.events).toEqual([
			"retired:quiescence",
			"active:stop",
			"active:quiescence",
			"disconnect",
		]);
	} finally {
		fixture.close();
	}
}

async function waitsForEveryRuntimeBeforeDisconnecting(): Promise<void> {
	const fixture = createResourceFixture();
	const first = Promise.withResolvers<void>();
	const second = Promise.withResolvers<void>();
	try {
		fixture.resources.registerRuntime(
			createRuntimeResource({
				events: fixture.events,
				name: "first",
				quiescence: first.promise,
			}),
		);
		fixture.resources.registerRuntime(
			createRuntimeResource({
				events: fixture.events,
				name: "second",
				quiescence: second.promise,
			}),
		);
		const settling = fixture.resources.settleResources();
		expect(fixture.events).toEqual(["first:stop", "second:stop"]);
		first.resolve();
		await Promise.resolve();
		expect(fixture.events).not.toContain("disconnect");
		second.resolve();
		await settling;
		expect(fixture.events).toEqual([
			"first:stop",
			"second:stop",
			"first:quiescence",
			"second:quiescence",
			"disconnect",
		]);
	} finally {
		fixture.close();
	}
}

async function retainsUnsettledRuntimeAndLeavesStoreOpen(): Promise<void> {
	const fixture = createResourceFixture();
	const quiescence = Promise.withResolvers<void>();
	const cause = new Error("runtime callbacks still active");
	try {
		const runtime = fixture.resources.registerRuntime(
			createRuntimeResource({
				events: fixture.events,
				name: "failed",
				quiescence: quiescence.promise,
			}),
		);
		const retirement = runtime.waitForQuiescence();
		quiescence.reject(cause);
		await expect(retirement).rejects.toBe(cause);
		await expect(fixture.resources.settleResources()).rejects.toMatchObject({
			message: "Worker runtimes did not settle safely",
			errors: [cause],
		});
		expect(fixture.events).toEqual([
			"failed:quiescence",
			"failed:stop",
			"failed:quiescence",
			"disconnect",
		]);
		expect(
			fixture.resources.stateStore.readNextOffset({ topic, partition: 0 }),
		).toBe(0n);
	} finally {
		fixture.close();
	}
}

test(
	"resource cleanup forgets retired runtimes and supports detached methods",
	forgetsOnlySettledRuntimes,
);
test(
	"resource cleanup starts every stop and waits before disconnecting",
	waitsForEveryRuntimeBeforeDisconnecting,
);
test(
	"failed runtime settlement remains tracked and leaves SQLite open",
	retainsUnsettledRuntimeAndLeavesStoreOpen,
);

async function stopFailureStillWaitsForQuiescence(): Promise<void> {
	const fixture = createResourceFixture();
	const cause = new Error("stop failed");
	async function stop(): Promise<void> {
		fixture.events.push("stop");
		throw cause;
	}
	async function waitForQuiescence(): Promise<void> {
		fixture.events.push("quiescence");
	}
	try {
		fixture.resources.registerRuntime({ stop, waitForQuiescence });
		await expect(fixture.resources.settleResources()).rejects.toMatchObject({
			errors: [cause],
		});
		expect(fixture.events).toEqual(["stop", "quiescence", "disconnect"]);
		expect(
			fixture.resources.stateStore.readNextOffset({ topic, partition: 0 }),
		).toBe(0n);
	} finally {
		fixture.close();
	}
}

test(
	"resource cleanup waits for quiescence even after stop fails",
	stopFailureStillWaitsForQuiescence,
);
