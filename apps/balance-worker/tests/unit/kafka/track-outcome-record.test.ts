import { describe, expect, test } from "bun:test";
import {
	InvalidRecordError,
	parseMeteringTrackOutcome,
	RecordKeyMismatchError,
	serializeMeteringRecord,
	UnsupportedRecordVersionError,
} from "@autumn/kafka";
import { createOutcome, createState } from "./kafka-test-fixtures.js";

describe("Kafka track outcome record", () => {
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
		).toThrow(UnsupportedRecordVersionError);
	});

	test("rejects a record whose Kafka key names another customer", () => {
		const outcome = createOutcome({ state: createState() });
		const serialized = serializeMeteringRecord({ record: outcome });

		expect(() =>
			parseMeteringTrackOutcome({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(RecordKeyMismatchError);
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
		).toThrow(InvalidRecordError);
		expect(() =>
			parseMeteringTrackOutcome({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, unexpected: true }),
					"utf8",
				),
			}),
		).toThrow(InvalidRecordError);
	});
});
