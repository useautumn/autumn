import { describe, expect, test } from "bun:test";
import { spanOf } from "../../src/client/librdkafka/producer/createLibrdkafkaProducer.js";
import {
	isKafkaProtocolError,
	KafkaBatchNotCommittedError,
	KafkaPartialDeliveryError,
	KafkaTransactionStateUnknownError,
	sendIdempotentBatch,
} from "../../src/kafka.js";
import { createRandom, fuzzSeeds, type Random } from "./fuzzRandom.js";

/**
 * Property tests for how a send's per-record delivery reports become one verdict. librdkafka reports each record
 * on its own; a record is written, refused before the broker appended it, or of unknown fate (a local timeout, a
 * cut connection, or a broker error librdkafka marks "possibly persisted"). Whatever the mix:
 * - a base offset is reported only when every record was written as one run starting there;
 * - "not committed" is reported only when no record can have been written;
 * - everything else is "state unknown", which the writer recovers from by reading the log.
 *
 * Replay a failure with FUZZ_SEED=<seed>; widen the sweep with FUZZ_RUNS=<n>.
 */

type Fate = "written" | "unwritten" | "unknown";

type RecordOutcome = {
	fate: Fate;
	settled: PromiseSettledResult<
		{
			topicName: string;
			partition: number;
			errorCode: number;
			baseOffset?: string;
		}[]
	>;
};

/** Broker refusals librdkafka marks not persisted: nothing was appended. */
const UNWRITTEN_REFUSALS = [
	{ code: 19, name: "NOT_ENOUGH_REPLICAS" },
	{ code: 29, name: "TOPIC_AUTHORIZATION_FAILED" },
	{ code: 10, name: "MESSAGE_TOO_LARGE" },
	{ code: 47, name: "INVALID_PRODUCER_EPOCH" },
	{ code: 3, name: "UNKNOWN_TOPIC_OR_PART" },
];

/** Client-side failures: the request may have reached the broker. */
const LOCAL_FAILURES = [
	{ code: -192, name: "Local: Message timed out" },
	{ code: -195, name: "Local: Broker transport failure" },
	{ code: -151, name: "Local: Purged in flight" },
];

function refusal({ code, name }: { code: number; name: string }) {
	return Object.assign(new Error(`Broker: ${name}`), { code });
}

type Scenario = {
	records: number;
	outcomes: RecordOutcome[];
	/** Where the written records landed, in send order. */
	writtenOffsets: (number | null)[];
};

function scenarioOf({
	random,
	allowPossiblyPersistedRefusals,
}: {
	random: Random;
	allowPossiblyPersistedRefusals: boolean;
}): Scenario {
	const records = random.int(1, 8);
	const base = random.int(0, 1_000);
	const shape = random.int(0, 4);
	const outcomes: RecordOutcome[] = [];
	const writtenOffsets: (number | null)[] = [];
	let next = base;
	for (let index = 0; index < records; index++) {
		const roll =
			shape === 0 ? 0 : shape === 1 ? random.int(1, 2) : random.int(0, 3);
		if (roll === 0 || (roll === 3 && !allowPossiblyPersistedRefusals)) {
			// Another writer's records may land between ours when the send was split into several batches.
			if (random.chance(0.1)) next += random.int(1, 3);
			writtenOffsets.push(next);
			outcomes.push({
				fate: "written",
				settled: {
					status: "fulfilled",
					value: [
						{
							topicName: "t",
							partition: 0,
							errorCode: 0,
							baseOffset: String(next),
						},
					],
				},
			});
			next += 1;
			continue;
		}
		writtenOffsets.push(null);
		if (roll === 1)
			outcomes.push({
				fate: "unwritten",
				settled: {
					status: "rejected",
					reason: refusal(random.pick(UNWRITTEN_REFUSALS)),
				},
			});
		else if (roll === 2) {
			const local = random.pick(LOCAL_FAILURES);
			outcomes.push({
				fate: "unknown",
				settled: {
					status: "rejected",
					reason: Object.assign(new Error(local.name), { code: local.code }),
				},
			});
		} else
			outcomes.push({
				fate: "unknown",
				settled: {
					status: "rejected",
					reason: refusal(
						random.pick([
							{ code: 7, name: "REQUEST_TIMED_OUT" },
							{ code: 20, name: "NOT_ENOUGH_REPLICAS_AFTER_APPEND" },
						]),
					),
				},
			});
	}
	// The order the delivery reports settle in is librdkafka's, not the send's.
	return { records, outcomes, writtenOffsets };
}

function senderOf(outcomes: RecordOutcome[]) {
	return {
		async send() {
			return spanOf({ outcomes: outcomes.map((outcome) => outcome.settled) });
		},
	};
}

async function verdictOf(scenario: Scenario) {
	const messages = Array.from({ length: scenario.records }, (_, index) => ({
		key: Buffer.from("k"),
		value: Buffer.from(String(index)),
	}));
	try {
		const { baseOffset } = await sendIdempotentBatch({
			sender: senderOf(scenario.outcomes),
			topic: "t",
			partition: 0,
			messages,
		});
		return { kind: "committed" as const, baseOffset };
	} catch (cause) {
		if (cause instanceof KafkaBatchNotCommittedError)
			return { kind: "not committed" as const, cause };
		if (cause instanceof KafkaTransactionStateUnknownError)
			return { kind: "unknown" as const, cause };
		return { kind: "other" as const, cause };
	}
}

function violationsOf(
	scenario: Scenario,
	verdict: Awaited<ReturnType<typeof verdictOf>>,
): string[] {
	const fates = scenario.outcomes.map((outcome) => outcome.fate);
	const written = scenario.writtenOffsets.filter(
		(offset): offset is number => offset !== null,
	);
	const allWritten = fates.every((fate) => fate === "written");
	const oneRun =
		allWritten &&
		written.every((offset, index) => offset === (written[0] as number) + index);
	const violations: string[] = [];
	if (verdict.kind === "committed") {
		if (!oneRun)
			violations.push("reported committed but not written as one run");
		else if (verdict.baseOffset !== BigInt(written[0] as number))
			violations.push(
				`reported base ${verdict.baseOffset}, wrote from ${written[0]}`,
			);
	}
	if (
		verdict.kind === "not committed" &&
		fates.some((fate) => fate !== "unwritten")
	)
		violations.push(
			`reported not committed though a record may be in the log (${fates.join(",")})`,
		);
	if (oneRun && verdict.kind !== "committed")
		violations.push(`a batch written as one run reported ${verdict.kind}`);
	if (
		fates.every((fate) => fate === "unwritten") &&
		verdict.kind !== "not committed"
	)
		violations.push(
			`a batch the broker refused outright reported ${verdict.kind}`,
		);
	if (verdict.kind === "other")
		violations.push(`unclassified failure: ${String(verdict.cause)}`);
	return violations;
}

async function sweep({
	allowPossiblyPersistedRefusals,
}: {
	allowPossiblyPersistedRefusals: boolean;
}): Promise<string[]> {
	const failed: string[] = [];
	for (const seed of fuzzSeeds({ defaultRuns: 400 })) {
		const random = createRandom(seed);
		const scenario = scenarioOf({ random, allowPossiblyPersistedRefusals });
		const verdict = await verdictOf(scenario);
		const violations = violationsOf(scenario, verdict);
		if (violations.length > 0)
			failed.push(
				`seed ${seed}: ${violations.join("; ")} [${scenario.outcomes
					.map((outcome, index) =>
						outcome.fate === "written"
							? `@${scenario.writtenOffsets[index]}`
							: String((outcome.settled as PromiseRejectedResult).reason?.code),
					)
					.join(" ")}]`,
			);
	}
	return failed;
}

describe("a send's per-record delivery reports as one verdict", () => {
	test("written, refused and timed-out records in any mix", async () => {
		expect(await sweep({ allowPossiblyPersistedRefusals: false })).toEqual([]);
	});

	test("spanOf reports each partition's lowest and highest offset and never a partial send as a refusal", () => {
		const failed: string[] = [];
		for (const seed of fuzzSeeds({ defaultRuns: 400 })) {
			const random = createRandom(seed);
			const partitions = random.int(1, 3);
			const outcomes: PromiseSettledResult<
				{
					topicName: string;
					partition: number;
					errorCode: number;
					baseOffset: string;
				}[]
			>[] = [];
			const expected = new Map<number, { low: number; high: number }>();
			let delivered = 0;
			for (let index = random.int(1, 10); index > 0; index--) {
				if (random.chance(0.2)) {
					outcomes.push({
						status: "rejected",
						reason: refusal(random.pick(UNWRITTEN_REFUSALS)),
					});
					continue;
				}
				delivered += 1;
				const partition = random.int(0, partitions - 1);
				const offset = random.int(0, 50);
				const span = expected.get(partition) ?? { low: offset, high: offset };
				expected.set(partition, {
					low: Math.min(span.low, offset),
					high: Math.max(span.high, offset),
				});
				outcomes.push({
					status: "fulfilled",
					value: [
						{
							topicName: "t",
							partition,
							errorCode: 0,
							baseOffset: String(offset),
						},
					],
				});
			}
			const failures = outcomes.length - delivered;
			try {
				const spans = spanOf({ outcomes });
				if (failures > 0)
					failed.push(`seed ${seed}: a failed send reported spans`);
				for (const span of spans) {
					const want = expected.get(span.partition);
					if (
						!want ||
						span.baseOffset !== String(want.low) ||
						span.lastOffset !== String(want.high)
					)
						failed.push(
							`seed ${seed}: p${span.partition} span ${span.baseOffset}..${span.lastOffset}`,
						);
				}
				if (spans.length !== expected.size)
					failed.push(
						`seed ${seed}: ${spans.length} spans for ${expected.size} partitions`,
					);
			} catch (cause) {
				if (failures === 0)
					failed.push(`seed ${seed}: a written send threw ${String(cause)}`);
				else if (delivered > 0) {
					if (!(cause instanceof KafkaPartialDeliveryError))
						failed.push(`seed ${seed}: a partial send threw ${String(cause)}`);
					else if (
						cause.delivered !== delivered ||
						cause.total !== outcomes.length
					)
						failed.push(
							`seed ${seed}: partial ${cause.delivered}/${cause.total}`,
						);
					if (isKafkaProtocolError({ cause }))
						failed.push(`seed ${seed}: a partial send reads as a refusal`);
				} else if (!isKafkaProtocolError({ cause }))
					failed.push(`seed ${seed}: an outright refusal lost its code`);
			}
		}
		expect(failed).toEqual([]);
	});
});

// librdkafka fails a record whose retries ran out on REQUEST_TIMED_OUT or NOT_ENOUGH_REPLICAS_AFTER_APPEND with that
// broker code, but marks it possibly persisted: the leader may have appended it. kafkajs wrapped the same exhaustion
// in KafkaJSNumberOfRetriesExceeded, which the writer read as unknown.
test("a record the broker may have appended before refusing is never reported as not committed", async () => {
	expect(await sweep({ allowPossiblyPersistedRefusals: true })).toEqual([]);
});
