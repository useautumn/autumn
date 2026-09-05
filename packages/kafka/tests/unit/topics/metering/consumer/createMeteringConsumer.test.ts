import { expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createProgressTracker } from "../../../../../src/consumer/createProgressTracker.js";
import { InvalidRecordError } from "../../../../../src/lib/recordErrors.js";
import { createMeteringConsumer } from "../../../../../src/topics/metering/consumer/createMeteringConsumer.js";
import type {
	MeteringRecordApplication,
	MeteringRecordFailure,
} from "../../../../../src/topics/metering/consumer/types/meteringConsumer.js";
import { serializeMeteringRecord } from "../../../../../src/topics/metering/meteringTopic.js";
import {
	createConsumerFixture,
	createRecord,
	partition,
	topic,
} from "../../../consumer/consumerTestFixtures.js";

function readResumeOffset(): null {
	return null;
}

function createMeteringRecords() {
	const identity = {
		orgId: "org_1",
		env: "sandbox",
		customerId: "cus_1",
	} as const;
	const state = createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "balance", balance: 10, usage: 0 }],
			},
		},
	});
	const command = parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId: "command",
			requestId: "request",
			identity,
			entityId: null,
			featureId: "messages",
			value: 5,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});
	const decision = computeTrack({
		state,
		command,
	});
	if (decision.kind !== "new") throw new Error("Expected a new outcome");
	return { outcome: decision.outcome };
}

async function deliversTypedRecordsWithoutChangingOffsets(): Promise<void> {
	const fixture = createConsumerFixture();
	const records = createMeteringRecords();
	const applications: MeteringRecordApplication[] = [];
	function applyRecord(application: MeteringRecordApplication): void {
		applications.push(application);
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await consumer.start();
	await fixture.deliverBatch({
		records: [
			{
				offset: "0",
				...serializeMeteringRecord({ record: records.outcome }),
			},
			{ offset: "1", ...serializeMeteringRecord({ record: records.outcome }) },
		],
	});
	expect(applications).toEqual([
		{
			position: { topic, partition, offset: 0n },
			record: records.outcome,
		},
		{ position: { topic, partition, offset: 1n }, record: records.outcome },
	]);
	expect(fixture.commits).toEqual([[{ topic, partition, offset: "2" }]]);
	await consumer.stop();
}

async function reportsCodecFailureThroughApplicationBoundary(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	let failure: MeteringRecordFailure | undefined;
	const mapped = new Error("record invariant failed");
	function applyRecord(): never {
		throw new Error("Malformed record reached application");
	}
	function onRecordError(input: MeteringRecordFailure): never {
		failure = input;
		throw mapped;
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord, onRecordError },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	await expect(
		fixture.deliverBatch({ records: [createRecord("0")] }),
	).rejects.toBe(mapped);
	expect(failure).toMatchObject({ topic, partition, offset: "0" });
	expect(failure?.cause).toBeInstanceOf(InvalidRecordError);
	expect(fixture.commits).toEqual([]);
	expect(progress.read({ topic, partition })).toBeNull();
	await consumer.stop();
}

async function preservesUnmappedAndAsynchronousFailures(): Promise<void> {
	const raw = createConsumerFixture();
	function applyRecord(): undefined {
		return undefined;
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: raw.consumer,
			handler: { readResumeOffset, applyRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await consumer.start();
	await expect(
		raw.deliverBatch({ records: [createRecord("0")] }),
	).rejects.toBeInstanceOf(InvalidRecordError);
	await consumer.stop();

	const asynchronous = createConsumerFixture();
	const cause = new Error("store failed");
	const mapped = new Error("application failed", { cause });
	async function rejectApplication(): Promise<undefined> {
		throw cause;
	}
	function onRecordError(failure: MeteringRecordFailure): never {
		expect(failure.cause).toBe(cause);
		throw mapped;
	}
	const next = createMeteringConsumer({
		ctx: {
			consumer: asynchronous.consumer,
			handler: {
				readResumeOffset,
				applyRecord: rejectApplication,
				onRecordError,
			},
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await next.start();
	await expect(
		asynchronous.deliverBatch({
			records: [
				{
					offset: "0",
					...serializeMeteringRecord({
						record: createMeteringRecords().outcome,
					}),
				},
			],
		}),
	).rejects.toBe(mapped);
	expect(asynchronous.commits).toEqual([]);
	await next.stop();
}

test(
	"metering consumer applies engine-parsed outcomes in order",
	deliversTypedRecordsWithoutChangingOffsets,
);
test(
	"metering consumer delegates codec error policy without committing",
	reportsCodecFailureThroughApplicationBoundary,
);
test(
	"metering consumer preserves raw errors and maps asynchronous handler failure",
	preservesUnmappedAndAsynchronousFailures,
);
