import { describe, expect, test } from "bun:test";
import {
	InvalidRecordError as InvalidKafkaMeteringRecordError,
	RecordKeyMismatchError as KafkaMeteringRecordKeyMismatchError,
	parseMeteringRecord as parseKafkaMeteringRecord,
	serializeMeteringRecord,
	UnsupportedRecordVersionError as UnsupportedKafkaMeteringRecordVersionError,
} from "@autumn/kafka";
import { createInitializeMutation } from "../../fixtures/mutations.js";
import {
	createMutation,
	createState,
	serializeKafkaMutationRecord,
} from "./kafka-test-fixtures.js";

describe("Kafka metering record", () => {
	test("round-trips a versioned track mutation with its customer partition key", () => {
		const mutation = createMutation({ state: createState() });
		const serialized = serializeMeteringRecord({ record: mutation });

		expect(
			parseKafkaMeteringRecord({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(mutation);
	});

	test("round-trips a versioned initialize mutation with its customer partition key", () => {
		const initialization = createInitializeMutation({ state: createState() });
		const serialized = serializeKafkaMutationRecord({
			mutation: initialization,
		});

		expect(
			parseKafkaMeteringRecord({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(initialization);
	});

	test("rejects an unsupported envelope version", () => {
		const mutation = createMutation({ state: createState() });
		const serialized = serializeMeteringRecord({ record: mutation });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseKafkaMeteringRecord({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, schemaVersion: 2 }),
					"utf8",
				),
			}),
		).toThrow(UnsupportedKafkaMeteringRecordVersionError);
	});

	test("rejects a record whose Kafka key names another customer", () => {
		const mutation = createMutation({ state: createState() });
		const serialized = serializeMeteringRecord({ record: mutation });

		expect(() =>
			parseKafkaMeteringRecord({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(KafkaMeteringRecordKeyMismatchError);
	});

	test("rejects an initialize mutation keyed to another customer", () => {
		const serialized = serializeKafkaMutationRecord({
			mutation: createInitializeMutation({ state: createState() }),
		});

		expect(() =>
			parseKafkaMeteringRecord({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(KafkaMeteringRecordKeyMismatchError);
	});

	test("rejects malformed and non-strict envelopes", () => {
		const mutation = createMutation({ state: createState() });
		const serialized = serializeMeteringRecord({ record: mutation });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseKafkaMeteringRecord({
				key: serialized.key,
				value: Buffer.from("not-json", "utf8"),
			}),
		).toThrow(InvalidKafkaMeteringRecordError);
		expect(() =>
			parseKafkaMeteringRecord({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, unexpected: true }),
					"utf8",
				),
			}),
		).toThrow(InvalidKafkaMeteringRecordError);
	});
});
