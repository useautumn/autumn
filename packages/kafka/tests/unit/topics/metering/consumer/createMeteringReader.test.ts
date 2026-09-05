import { expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { RecordKeyMismatchError } from "../../../../../src/lib/recordErrors.js";
import { createMeteringReader } from "../../../../../src/topics/metering/consumer/createMeteringReader.js";
import { serializeMeteringRecord } from "../../../../../src/topics/metering/meteringTopic.js";
import { createReaderFixture } from "../../../consumer/reader/readerFixture.js";

function createOutcome() {
	const identity = {
		orgId: "org_1",
		env: "sandbox" as const,
		customerId: "customer_1",
	};
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
			value: 1,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});
	const decision = computeTrack({ state, command });
	if (decision.kind !== "new") throw new Error("Expected a new outcome");
	return decision.outcome;
}

async function readsTypedRecordsWithoutAStore(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createMeteringReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const record = createOutcome();
	const serialized = serializeMeteringRecord({ record });
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 3n,
	});
	await fake.ready;
	await fake.batch({ offsets: ["2"], ...serialized });
	expect(await reading).toEqual([{ partition: 2, offset: 2n, record }]);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
}

async function rejectsMismatchedTopicRecords(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createMeteringReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const serialized = serializeMeteringRecord({
		record: createOutcome(),
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 3n,
	});
	await fake.ready;
	await fake.batch({
		offsets: ["2"],
		...serialized,
		key: Buffer.from("wrong"),
	});
	await expect(reading).rejects.toBeInstanceOf(RecordKeyMismatchError);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
}

test(
	"reads typed metering entries without a balance-worker or SQLite dependency",
	readsTypedRecordsWithoutAStore,
);
test(
	"validates metering keys after the underlying read is settled",
	rejectsMismatchedTopicRecords,
);
