import { describe, expect, test } from "bun:test";
import {
	InvalidKafkaMeteringRecordError,
	KafkaMeteringRecordKeyMismatchError,
	parseKafkaMeteringRecord,
	parseKafkaTrackOutcomeRecord,
	serializeKafkaStateInitializedRecord,
	serializeKafkaTrackOutcomeRecord,
	UnsupportedKafkaMeteringRecordVersionError,
} from "../../../src/kafka/kafkaMeteringRecord.js";
import { createOutcome, createState } from "./kafka-test-fixtures.js";

describe("Kafka metering record", () => {
	test("round-trips a versioned outcome with its customer partition key", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeMeteringRecord({ record: outcome });

		expect(
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(outcome);
	});

	test("round-trips a versioned state initialization with its customer partition key", () => {
		const initialization = {
			schemaVersion: 1,
			type: "state_initialized",
			initializationId: "init_1",
			initializedAt: 1_700_000_000_000,
			state: createState(),
		} as const;
		const serialized = serializeKafkaStateInitializedRecord({ initialization });

		expect(
			parseKafkaMeteringRecord({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(initialization);
	});

	test("rejects an unsupported envelope version", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeMeteringRecord({ record: outcome });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, schemaVersion: 2 }),
					"utf8",
				),
			}),
		).toThrow(UnsupportedKafkaMeteringRecordVersionError);
	});

	test("rejects a record whose Kafka key names another customer", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeMeteringRecord({ record: outcome });

		expect(() =>
			parseMeteringTrackOutcome({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(KafkaMeteringRecordKeyMismatchError);
	});

	test("rejects a state initialization keyed to another customer", () => {
		const serialized = serializeKafkaStateInitializedRecord({
			initialization: {
				schemaVersion: 1,
				type: "state_initialized",
				initializationId: "init_1",
				initializedAt: 1_700_000_000_000,
				state: createState(),
			},
		});

		expect(() =>
			parseKafkaMeteringRecord({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(KafkaMeteringRecordKeyMismatchError);
	});

	test("rejects malformed and non-strict envelopes", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeMeteringRecord({ record: outcome });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: Buffer.from("not-json", "utf8"),
			}),
		).toThrow(InvalidKafkaMeteringRecordError);
		expect(() =>
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, unexpected: true }),
					"utf8",
				),
			}),
		).toThrow(InvalidKafkaMeteringRecordError);
	});
});
