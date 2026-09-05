import { expect, test } from "bun:test";
import { createPartitionReader } from "../../../../src/consumer/reader/createPartitionReader.js";
import { createDeferred, createReaderFixture } from "./readerFixture.js";

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (cause) {
		return cause;
	}
	return undefined;
}

async function readsExactRangeAndSettles(): Promise<void> {
	const stop = createDeferred();
	const fake = createReaderFixture({ stopGate: stop.promise });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	await fake.ready;
	expect(fake.settings[0]).toMatchObject({
		allowAutoTopicCreation: false,
		readUncommitted: false,
	});
	expect(fake.seeks).toEqual([
		{ topic: "metering", partition: 2, offset: "2" },
	]);
	expect(fake.pauses).toEqual([[{ topic: "metering", partitions: [0] }]]);
	await fake.batch({ offsets: ["1", "2", "4", "5"] });
	await Bun.sleep(0);
	expect(fake.lifecycle).toContain("stop");
	expect(fake.lifecycle).not.toContain("disconnect");
	stop.resolve();
	const records = await reading;
	expect(records).toEqual([
		{
			partition: 2,
			offset: 2n,
			key: Buffer.from("key"),
			value: Buffer.from("2"),
		},
		{
			partition: 2,
			offset: 4n,
			key: Buffer.from("key"),
			value: Buffer.from("4"),
		},
	]);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
	expect(fake.listeners.size).toBe(0);
}

async function usesConsumedMarkersNotHighWatermarks(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	await fake.ready;
	await fake.batch({ offsets: ["4"], stale: true });
	fake.filtered({ last: "4", batchSize: 1 });
	fake.filtered({ last: "3" });
	await Bun.sleep(0);
	expect(fake.lifecycle).not.toContain("stop");
	fake.filtered({ last: "4" });
	expect(await reading).toEqual([]);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
}

async function cancelsAndTimesOut(): Promise<void> {
	for (const cancellation of ["signal", "disconnect", "timeout"]) {
		const fake = createReaderFixture();
		const controller = new AbortController();
		const reader = createPartitionReader({
			ctx: { kafka: fake.kafka },
			config: { topic: "metering" },
		});
		const reading = reader.readRange({
			partition: 2,
			fromOffset: 2n,
			toOffset: 5n,
			signal: controller.signal,
			timeoutMs: cancellation === "timeout" ? 5 : 1_000,
		});
		const rejected = captureFailure(reading);
		await fake.ready;
		if (cancellation === "signal") controller.abort();
		if (cancellation === "disconnect") await reader.disconnect();
		expect(await rejected).toBeInstanceOf(Error);
		expect(fake.lifecycle.slice(-2)).toEqual(["stop", "disconnect"]);
		expect(fake.listeners.size).toBe(0);
	}
}

async function preservesFailuresAndReportsCleanupFailure(): Promise<void> {
	const original = new Error("run failed");
	const cleanup = new Error("disconnect failed");
	const failed = createReaderFixture({
		runFailure: original,
		disconnectFailure: cleanup,
	});
	const failedReader = createPartitionReader({
		ctx: { kafka: failed.kafka },
		config: { topic: "metering" },
	});
	await expect(
		failedReader.readRange({ partition: 2, fromOffset: 2n, toOffset: 5n }),
	).rejects.toBe(original);
	expect(failed.lifecycle.slice(-2)).toEqual(["stop", "disconnect"]);
	const fake = createReaderFixture({ disconnectFailure: cleanup });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	const rejected = captureFailure(reading);
	await fake.ready;
	fake.filtered({ last: "4" });
	expect(await rejected).toBe(cleanup);
}

async function stopsBeforeWaitingForStartupSettlement(): Promise<void> {
	const startup = createDeferred();
	const fake = createReaderFixture({ runGate: startup.promise });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = captureFailure(
		reader.readRange({ partition: 2, fromOffset: 2n, toOffset: 5n }),
	);
	await fake.ready;
	const disconnect = reader.disconnect();
	await Bun.sleep(0);
	expect(fake.lifecycle.slice(-2)).toEqual(["stop", "disconnect"]);
	startup.resolve();
	await disconnect;
	expect(await reading).toBeInstanceOf(Error);
}

async function reportsCancellationCleanupFailure(): Promise<void> {
	const cleanupFailure = new Error("disconnect failed");
	const fake = createReaderFixture({ disconnectFailure: cleanupFailure });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = captureFailure(
		reader.readRange({ partition: 2, fromOffset: 2n, toOffset: 5n }),
	);
	await fake.ready;
	await expect(reader.disconnect()).rejects.toBe(cleanupFailure);
	expect(await reading).toMatchObject({ name: "AbortError" });
	await expect(reader.disconnect()).rejects.toBe(cleanupFailure);
}

async function resumesRebalancesWithoutStaleProgress(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	await fake.ready;
	await fake.batch({ offsets: ["2"] });
	fake.rebalance();
	fake.filtered({ last: "4" });
	await Bun.sleep(0);
	expect(fake.lifecycle).not.toContain("stop");
	fake.join({ partitions: ["0", "2"] });
	expect(fake.seeks.at(-1)).toEqual({
		topic: "metering",
		partition: 2,
		offset: "3",
	});
	fake.filtered({ last: "100", partition: 0 });
	await Bun.sleep(0);
	expect(fake.lifecycle).not.toContain("stop");
	await fake.batch({ offsets: ["2", "3"], last: "4" });
	const records = await reading;
	expect(records).toHaveLength(2);
	expect(records[0].offset).toBe(2n);
	expect(records[1].offset).toBe(3n);
}

test(
	"reads only the requested partition range and settles before returning",
	readsExactRangeAndSettles,
);
test(
	"uses consumed markers, not watermarks or stale batches, as range completion",
	usesConsumedMarkersNotHighWatermarks,
);
test(
	"cancellation, disconnect and timeout stop and disconnect the reader",
	cancelsAndTimesOut,
);
test(
	"preserves read failures and rejects cleanup-only failures",
	preservesFailuresAndReportsCleanupFailure,
);
test(
	"requests shutdown before waiting for consumer startup to settle",
	stopsBeforeWaitingForStartupSettlement,
);
test(
	"reports shutdown cleanup failure without replacing a canceled read's primary error",
	reportsCancellationCleanupFailure,
);
test(
	"normalizes assignments and resumes without stale progress or duplicate records",
	resumesRebalancesWithoutStaleProgress,
);
