import { expect, test } from "bun:test";
import type {
	KafkaOffsetCommit,
	KafkaProducer,
	KafkaTransaction,
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

/** A producer for batches and a consumer-group committer for offsets, sharing one lifecycle so their order is visible. */
function createFakes({
	refuseGroupCommit,
	holdFirstGroupCommit,
}: {
	/** Decides per attempt whether the group commit of `offset` is refused. */
	refuseGroupCommit?(params: { offset: string; attempt: number }): boolean;
	holdFirstGroupCommit?: Promise<void>;
} = {}) {
	const lifecycle: string[] = [];
	const transaction: KafkaTransaction = {
		send: async () => {
			lifecycle.push("send");
			return [{ topicName: topic, partition, errorCode: 0, baseOffset: "41" }];
		},
		sendOffsets: async (offsets) => {
			lifecycle.push(`offset:${offsets.topics[0]?.partitions[0]?.offset}`);
		},
		commit: async () => {
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
	let attempts = 0;
	let held = false;
	const commandOffsets = {
		commit: async (offsets: KafkaOffsetCommit) => {
			const offset = offsets.topics[0]?.partitions[0]?.offset ?? "?";
			attempts += 1;
			lifecycle.push(`group:${offset}`);
			if (holdFirstGroupCommit && !held) {
				held = true;
				await holdFirstGroupCommit;
			}
			if (refuseGroupCommit?.({ offset, attempt: attempts }))
				throw new Error(`refused ${offset}`);
		},
	};
	return { producer, commandOffsets, lifecycle };
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
	fakes,
	timing,
	warnings,
}: {
	fakes: ReturnType<typeof createFakes>;
	timing: CommandOffsetSettleTiming;
	warnings?: string[];
}) {
	return createMutationPublisher({
		ctx: {
			producer: fakes.producer,
			commandOffsets: fakes.commandOffsets,
			settle: timing,
			logger: {
				warn: (...args: unknown[]) => {
					warnings?.push(String(args[0]));
				},
			},
		},
		config: { commandTopic: "commands" },
	});
}

test("a burst of skipped commands lands as one group commit, never a transaction, and the next waits out the gap", async () => {
	const fakes = createFakes();
	const clock = createClock();
	const appender = createAppender({ fakes, timing: clock.timing });
	appender.settleCommandOffset({ topic, partition, nextOffset: 12n });
	appender.settleCommandOffset({ topic, partition, nextOffset: 13n });
	appender.settleCommandOffset({ topic, partition, nextOffset: 14n });
	expect(fakes.lifecycle).toEqual([]);
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:14"]);
	fakes.lifecycle.length = 0;
	appender.settleCommandOffset({ topic, partition, nextOffset: 15n });
	await clock.advance(49);
	expect(fakes.lifecycle).toEqual([]);
	await clock.advance(1);
	expect(fakes.lifecycle).toEqual(["group:15"]);
});

test("a batch's command offset lands through the group commit after the transaction, never inside it", async () => {
	const fakes = createFakes();
	const clock = createClock();
	const appender = createAppender({ fakes, timing: clock.timing });
	const mutation = {
		...createMutation({ state: createState(), commandId: "queued" }),
		source: { commandOffset: "17" },
	};
	await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
	expect(fakes.lifecycle).toEqual(["transaction", "send", "commit"]);
	fakes.lifecycle.length = 0;
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:18"]);
	expect(clock.scheduled()).toBe(0);
});

test("a batch behind the waiting offsets lands the waiting one, so nothing lands twice", async () => {
	const fakes = createFakes();
	const clock = createClock();
	const appender = createAppender({ fakes, timing: clock.timing });
	appender.settleCommandOffset({ topic, partition, nextOffset: 20n });
	const mutation = {
		...createMutation({ state: createState(), commandId: "queued" }),
		source: { commandOffset: "17" },
	};
	await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
	expect(fakes.lifecycle).toEqual(["transaction", "send", "commit"]);
	fakes.lifecycle.length = 0;
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:20"]);
	await clock.advance(100);
	expect(fakes.lifecycle).toEqual(["group:20"]);
	expect(clock.scheduled()).toBe(0);
});

test("a batch past the waiting offsets lands its own, and the waiting ones are covered", async () => {
	const fakes = createFakes();
	const clock = createClock();
	const appender = createAppender({ fakes, timing: clock.timing });
	appender.settleCommandOffset({ topic, partition, nextOffset: 20n });
	const mutation = {
		...createMutation({ state: createState(), commandId: "queued" }),
		source: { commandOffset: "25" },
	};
	await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
	expect(fakes.lifecycle).toEqual(["transaction", "send", "commit"]);
	fakes.lifecycle.length = 0;
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:26"]);
	await clock.advance(100);
	expect(fakes.lifecycle).toEqual(["group:26"]);
});

test("a batch stands when its offset landing is refused; the offset is retried after the gap", async () => {
	const fakes = createFakes({
		refuseGroupCommit: ({ offset, attempt }) =>
			offset === "18" && attempt === 1,
	});
	const clock = createClock();
	const warnings: string[] = [];
	const appender = createAppender({ fakes, timing: clock.timing, warnings });
	const mutation = {
		...createMutation({ state: createState(), commandId: "queued" }),
		source: { commandOffset: "17" },
	};
	await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
	expect(fakes.lifecycle).toEqual(["transaction", "send", "commit"]);
	fakes.lifecycle.length = 0;
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:18"]);
	expect(warnings).toEqual([
		"Command offsets could not be landed; retrying after the gap",
	]);
	await clock.advance(50);
	expect(fakes.lifecycle).toEqual(["group:18", "group:18"]);
	expect(clock.scheduled()).toBe(0);
});

test("an offset already landed is never committed again", async () => {
	const fakes = createFakes();
	const clock = createClock();
	const appender = createAppender({ fakes, timing: clock.timing });
	await appender.commitCommandOffset({ topic, partition, nextOffset: 40n });
	expect(fakes.lifecycle).toEqual(["group:40"]);
	fakes.lifecycle.length = 0;
	appender.settleCommandOffset({ topic, partition, nextOffset: 40n });
	appender.settleCommandOffset({ topic, partition, nextOffset: 39n });
	await clock.advance(100);
	expect(fakes.lifecycle).toEqual([]);
	expect(clock.scheduled()).toBe(0);
});

test("a refused landing is retried after the gap and never blocks the next command", async () => {
	const fakes = createFakes({
		refuseGroupCommit: ({ offset, attempt }) =>
			offset === "30" && attempt === 1,
	});
	const clock = createClock();
	const warnings: string[] = [];
	const appender = createAppender({ fakes, timing: clock.timing, warnings });
	appender.settleCommandOffset({ topic, partition, nextOffset: 30n });
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:30"]);
	expect(warnings).toEqual([
		"Command offsets could not be landed; retrying after the gap",
	]);
	expect(() =>
		appender.settleCommandOffset({ topic, partition, nextOffset: 31n }),
	).not.toThrow();
	await clock.advance(49);
	expect(fakes.lifecycle).toEqual(["group:30"]);
	await clock.advance(1);
	expect(fakes.lifecycle).toEqual(["group:30", "group:31"]);
	expect(warnings).toHaveLength(1);
	expect(clock.scheduled()).toBe(0);
});

test("a landing that keeps failing warns once, and the drain reports it and stops retrying", async () => {
	const fakes = createFakes({ refuseGroupCommit: () => true });
	const clock = createClock();
	const warnings: string[] = [];
	const appender = createAppender({ fakes, timing: clock.timing, warnings });
	appender.settleCommandOffset({ topic, partition, nextOffset: 30n });
	await clock.advance(0);
	await clock.advance(50);
	expect(fakes.lifecycle).toEqual(["group:30", "group:30"]);
	expect(warnings).toHaveLength(1);
	await expect(appender.flushCommandOffsets()).rejects.toThrow("refused 30");
	expect(fakes.lifecycle).toEqual(["group:30", "group:30", "group:30"]);
	await clock.advance(100);
	expect(fakes.lifecycle).toHaveLength(3);
	expect(clock.scheduled()).toBe(0);
});

test("a flush lands what is waiting at once, including what settled during a landing", async () => {
	const gate = Promise.withResolvers<void>();
	const fakes = createFakes({ holdFirstGroupCommit: gate.promise });
	const clock = createClock();
	const appender = createAppender({ fakes, timing: clock.timing });
	appender.settleCommandOffset({ topic, partition, nextOffset: 50n });
	await clock.advance(0);
	expect(fakes.lifecycle).toEqual(["group:50"]);
	appender.settleCommandOffset({ topic, partition, nextOffset: 51n });
	expect(clock.scheduled()).toBe(0);
	const flushed = appender.flushCommandOffsets();
	gate.resolve();
	await flushed;
	expect(fakes.lifecycle).toEqual(["group:50", "group:51"]);
	expect(clock.scheduled()).toBe(0);
});

test("landing outside a batch needs the consumer group's committer", async () => {
	const fakes = createFakes();
	const clock = createClock();
	const appender = createMutationPublisher({
		ctx: { producer: fakes.producer, settle: clock.timing },
		config: { commandTopic: "commands" },
	});
	await expect(
		appender.commitCommandOffset({ topic, partition, nextOffset: 7n }),
	).rejects.toThrow("committer");
	expect(fakes.lifecycle).toEqual([]);
});
