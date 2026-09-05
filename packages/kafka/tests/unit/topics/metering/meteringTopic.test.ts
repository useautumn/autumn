import { describe, expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "../../../../src/lib/recordErrors.js";
import {
	parseMeteringRecord,
	parseMeteringTrackOutcome,
	serializeMeteringRecord,
} from "../../../../src/topics/metering/meteringTopic.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

const createState = () =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [
					{ id: "messages_monthly", balance: 10, usage: 0 },
				],
			},
		},
	});

const createOutcome = () => {
	const decision = computeTrack({
		state: createState(),
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId: "cmd_1",
				requestId: "req_1",
				identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		}),
	});
	if (decision.kind !== "new") throw new Error("Expected a new outcome");
	return decision.outcome;
};

describe("meteringTopic", () => {
	test("round-trips a versioned outcome with its customer partition key", () => {
		const outcome = createOutcome();
		const serialized = serializeMeteringRecord({ record: outcome });

		expect(
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(outcome);
	});

	test("rejects an unsupported envelope version", () => {
		const serialized = serializeMeteringRecord({ record: createOutcome() });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, schemaVersion: 2 }),
					"utf8",
				),
			}),
		).toThrow(UnsupportedRecordVersionError);
	});

	test("rejects a record whose Kafka key names another customer", () => {
		const serialized = serializeMeteringRecord({ record: createOutcome() });

		expect(() =>
			parseMeteringTrackOutcome({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(RecordKeyMismatchError);
	});

	test("rejects malformed envelopes", () => {
		expect(() =>
			parseMeteringTrackOutcome({
				key: Buffer.from("key"),
				value: Buffer.from("not-json", "utf8"),
			}),
		).toThrow(InvalidRecordError);
	});
});

function rejectsInvalidMeteringPayloads(): void {
	const serialized = serializeMeteringRecord({ record: createOutcome() });
	const envelope = JSON.parse(serialized.value.toString("utf8"));
	for (const invalid of [
		{ ...envelope, type: "unknown_record" },
		{ ...envelope, type: "state_initialized" },
		{ ...envelope, payload: { ...envelope.payload, schemaVersion: 2 } },
	]) {
		function parse(): void {
			parseMeteringRecord({
				key: serialized.key,
				value: Buffer.from(JSON.stringify(invalid)),
			});
		}
		expect(parse).toThrow(InvalidRecordError);
	}
	let failure: unknown;
	try {
		parseMeteringRecord({
			key: serialized.key,
			value: Buffer.from(JSON.stringify({ ...envelope, payload: {} })),
		});
	} catch (cause) {
		failure = cause;
	}
	expect(failure).toBeInstanceOf(InvalidRecordError);
	expect((failure as Error).cause).toBeInstanceOf(Error);
}

test(
	"rejects unknown or mismatched metering payloads and retains domain validation causes",
	rejectsInvalidMeteringPayloads,
);
