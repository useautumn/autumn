import { describe, expect, test } from "bun:test";
import {
	InvalidKafkaTrackOutcomeRecordError,
	KafkaTrackOutcomeKeyMismatchError,
	parseKafkaTrackOutcomeRecord,
	serializeKafkaTrackOutcomeRecord,
	UnsupportedKafkaTrackOutcomeRecordVersionError,
} from "../../../src/kafka/trackOutcomeRecord.js";
import { createOutcome, createState } from "./kafka-test-fixtures.js";

describe("Kafka track outcome record", () => {
	test("round-trips a versioned outcome with its customer partition key", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeKafkaTrackOutcomeRecord({ outcome });

		expect(
			parseKafkaTrackOutcomeRecord({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(outcome);
	});

	test("rejects an unsupported envelope version", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeKafkaTrackOutcomeRecord({ outcome });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseKafkaTrackOutcomeRecord({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, schemaVersion: 2 }),
					"utf8",
				),
			}),
		).toThrow(UnsupportedKafkaTrackOutcomeRecordVersionError);
	});

	test("rejects a record whose Kafka key names another customer", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeKafkaTrackOutcomeRecord({ outcome });

		expect(() =>
			parseKafkaTrackOutcomeRecord({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(KafkaTrackOutcomeKeyMismatchError);
	});

	test("rejects malformed and non-strict envelopes", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeKafkaTrackOutcomeRecord({ outcome });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseKafkaTrackOutcomeRecord({
				key: serialized.key,
				value: Buffer.from("not-json", "utf8"),
			}),
		).toThrow(InvalidKafkaTrackOutcomeRecordError);
		expect(() =>
			parseKafkaTrackOutcomeRecord({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, unexpected: true }),
					"utf8",
				),
			}),
		).toThrow(InvalidKafkaTrackOutcomeRecordError);
	});
});
