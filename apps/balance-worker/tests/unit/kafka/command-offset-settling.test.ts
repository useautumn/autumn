import { expect, test } from "bun:test";
import {
	KafkaBatchNotCommittedError,
	type KafkaProducer,
	type KafkaTransaction,
} from "@autumn/kafka";
import {
	type CommandOffsetSettleTiming,
	createMutationPublisher,
} from "../../../src/kafka/createMutationPublisher.js";
import {
	createMutation,
	createState,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

function createFakeProducer({
	refuseOffset,
	holdFirstCommit,
}: {
	refuseOffset?: string;
	holdFirstCommit?: Promise<void>;
} = {}) {
	const lifecycle: string[] = [];
	let firstCommit = true;
	const transaction: KafkaTransaction = {
		send: async () => {
			lifecycle.push("send");
			return [{ topicName: topic, partition, errorCode: 0, baseOffset: "41" }];
		},
		sendOffsets: async (offsets) => {
			const offset = offsets.topics[0]?.partitions[0]?.offset;
			lifecycle.push(`offset:${offset}`);
			if (refuseOffset !== undefined && offset === refuseOffset)
				throw new Error(`refused ${offset}`);
		},
		commit: async () => {
			if (firstCommit && holdFirstCommit) {
				firstCommit = false;
				await holdFirstCommit;
			}
			lifecycle.push("commit");
		},
		abort: async () => {
			lifecycle.push("abort");
		},
	};
	const producer: KafkaProducer = {
		transaction: async () => {
			lifecycle.push("transaction");
			return transaction;
		},
	};
	return { producer, lifecycle };
}

/** A clock the tests move by hand: nothing scheduled runs until it is due. */
function createClock() {
	let now = 0;
	const due: { at: number; run: () => void; cancelled: boolean }[] = [];
	const timing: CommandOffsetSettleTiming = {
		gapMs: 50,
		now: () => now,
		schedule(run, delayMs) {
			const entry = { at: now + delayMs, run, cancelled: false };
			due.push(entry);
			return () => {
				entry.cancelled = true;
			};
		},
	};
	async function advance(ms: number): Promise<void> {
		now += ms;
		for (const entry of due.splice(0)) {
			if (entry.cancelled) continue;
			if (entry.at <= now) entry.run();
			else due.push(entry);
		}
		await settled();
	}
	function scheduled(): number {
		return due.filter((entry) => !entry.cancelled).length;
	}
	return { timing, advance, scheduled };
}

async function settled(): Promise<void> {
	for (let turn = 0; turn < 12; turn++)
		await new Promise<void>((resolve) => setImmediate(resolve));
}

function createAppender({
	producer,
	timing,
	warnings,
}: {
	producer: KafkaProducer;
	timing: CommandOffsetSettleTiming;
	warnings?: string[];
}) {
	return createMutationPublisher({
		ctx: {
			producer,
			settle: timing,
			logger: {
				warn: (...args: unknown[]) => {
					warnings?.push(String(args[0]));
				},
			},
		},
		config: { commandTopic: "commands", groupId: "workers" },
	});
}

test("a burst of skipped commands lands as one commit, and the next one waits out the gap", async () => {
	const fake = createFakeProducer();
	const clock = createClock();
	const appender = createAppender({
		producer: fake.producer,
		timing: clock.timing,
	});
	appender.settleCommandOffset({ topic, partition, nextOffset: 12n });
	appender.settleCommandOffset({ topic, partition, nextOffset: 13n });
	appender.settleCommandOffset({ topic, partition, nextOffset: 14n });
	expect(fake.lifecycle).toEqual([]);
	await clock.advance(0);
	expect(fake.lifecycle).toEqual(["transaction", "offset:14", "commit"]);
	fake.lifecycle.length = 0;
	appender.settleCommandOffset({ topic, partition, nextOffset: 15n });
	await clock.advance(49);
	expect(fake.lifecycle).toEqual([]);
	await clock.advance(1);
	expect(fake.lifecycle).toEqual(["transaction", "offset:15", "commit"]);
});

test("a batch that commits carries the offsets still waiting, so nothing lands twice", async () => {
	const fake = createFakeProducer();
	const clock = createClock();
	const appender = createAppender({
		producer: fake.producer,
		timing: clock.timing,
	});
	appender.settleCommandOffset({ topic, partition, nextOffset: 20n });
	const mutation = {
		...createMutation({ state: createState(), commandId: "queued" }),
		source: { commandOffset: "17" },
	};
	await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
	expect(fake.lifecycle).toEqual([
		"transaction",
		"send",
		"offset:20",
		"commit",
	]);
	fake.lifecycle.length = 0;
	await clock.advance(100);
	expect(fake.lifecycle).toEqual([]);
	expect(clock.scheduled()).toBe(0);
});

test("a batch past the waiting offsets commits its own, and the waiting ones are covered", async () => {
	const fake = createFakeProducer();
	const clock = createClock();
	const appender = createAppender({
		producer: fake.producer,
		timing: clock.timing,
	});
	appender.settleCommandOffset({ topic, partition, nextOffset: 20n });
	const mutation = {
		...createMutation({ state: createState(), commandId: "queued" }),
		source: { commandOffset: "25" },
	};
	await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
	expect(fake.lifecycle).toEqual([
		"transaction",
		"send",
		"offset:26",
		"commit",
	]);
	fake.lifecycle.length = 0;
	await clock.advance(100);
	expect(fake.lifecycle).toEqual([]);
});

test("an offset already landed is never committed again", async () => {
	const fake = createFakeProducer();
	const clock = createClock();
	const appender = createAppender({
		producer: fake.producer,
		timing: clock.timing,
	});
	await appender.commitCommandOffset({ topic, partition, nextOffset: 40n });
	expect(fake.lifecycle).toEqual(["transaction", "offset:40", "commit"]);
	fake.lifecycle.length = 0;
	appender.settleCommandOffset({ topic, partition, nextOffset: 40n });
	appender.settleCommandOffset({ topic, partition, nextOffset: 39n });
	await clock.advance(100);
	expect(fake.lifecycle).toEqual([]);
	expect(clock.scheduled()).toBe(0);
});

test("a landing that fails is reported by the next command and by the drain", async () => {
	const fake = createFakeProducer({ refuseOffset: "30" });
	const clock = createClock();
	const warnings: string[] = [];
	const appender = createAppender({
		producer: fake.producer,
		timing: clock.timing,
		warnings,
	});
	appender.settleCommandOffset({ topic, partition, nextOffset: 30n });
	await clock.advance(0);
	expect(fake.lifecycle).toEqual(["transaction", "offset:30", "abort"]);
	expect(warnings).toEqual([
		"Command offsets could not be landed; the next command reports it",
	]);
	expect(() =>
		appender.settleCommandOffset({ topic, partition, nextOffset: 31n }),
	).toThrow(KafkaBatchNotCommittedError);
	await expect(appender.flushCommandOffsets()).rejects.toBeInstanceOf(
		KafkaBatchNotCommittedError,
	);
	expect(clock.scheduled()).toBe(0);
});

test("a flush lands what is waiting at once, including what settled during a landing", async () => {
	const gate = Promise.withResolvers<void>();
	const fake = createFakeProducer({ holdFirstCommit: gate.promise });
	const clock = createClock();
	const appender = createAppender({
		producer: fake.producer,
		timing: clock.timing,
	});
	appender.settleCommandOffset({ topic, partition, nextOffset: 50n });
	await clock.advance(0);
	expect(fake.lifecycle).toEqual(["transaction", "offset:50"]);
	appender.settleCommandOffset({ topic, partition, nextOffset: 51n });
	expect(clock.scheduled()).toBe(0);
	const flushed = appender.flushCommandOffsets();
	gate.resolve();
	await flushed;
	expect(fake.lifecycle).toEqual([
		"transaction",
		"offset:50",
		"commit",
		"transaction",
		"offset:51",
		"commit",
	]);
	expect(clock.scheduled()).toBe(0);
});
