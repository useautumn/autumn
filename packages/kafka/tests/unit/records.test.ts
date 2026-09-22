import { describe, expect, test } from "bun:test";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "../../src/lib/recordErrors.js";
import {
	assertTopicRecordKey,
	readTopicEnvelope,
} from "../../src/lib/topicEnvelope.js";
import {
	parseMeteringRecord,
	serializeMeteringRecord,
} from "../../src/topics/metering/meteringTopic.js";
import {
	createInitializeMutation,
	createTrackMutation,
} from "../meteringFixtures.js";

function rejectsMalformedEnvelopes(): void {
	for (const input of [
		null,
		[],
		"record",
		{},
		{ schemaVersion: 1, type: "claimed" },
		{ schemaVersion: 1, type: "claimed", payload: {}, extra: true },
		{ schemaVersion: "1", type: "claimed", payload: {} },
		{ schemaVersion: 1, type: 3, payload: {} },
	]) {
		function parse(): void {
			readTopicEnvelope({ value: Buffer.from(JSON.stringify(input)) });
		}
		expect(parse).toThrow(InvalidRecordError);
	}
	function parseMissingValue(): void {
		readTopicEnvelope({ value: null });
	}
	expect(parseMissingValue).toThrow(InvalidRecordError);
	let error: unknown;
	try {
		readTopicEnvelope({ value: Buffer.from("not-json") });
	} catch (cause) {
		error = cause;
	}
	expect(error).toBeInstanceOf(InvalidRecordError);
	expect((error as Error).cause).toBeInstanceOf(SyntaxError);
}

function preservesEnvelopeVersions(): void {
	const envelope = {
		schemaVersion: 1 as const,
		type: "claimed",
		payload: { partition: 1 },
	};
	expect(
		readTopicEnvelope({ value: Buffer.from(JSON.stringify(envelope)) }),
	).toEqual(envelope);
	let error: unknown;
	try {
		readTopicEnvelope({
			value: Buffer.from(JSON.stringify({ ...envelope, schemaVersion: 2 })),
		});
	} catch (cause) {
		error = cause;
	}
	expect(error).toBeInstanceOf(UnsupportedRecordVersionError);
	expect(error).toMatchObject({ schemaVersion: 2 });
}

function preservesKeyMismatchDetails(): void {
	for (const key of [null, Buffer.from("wrong")]) {
		let error: unknown;
		try {
			assertTopicRecordKey({ key, expectedKey: "expected" });
		} catch (cause) {
			error = cause;
		}
		expect(error).toBeInstanceOf(RecordKeyMismatchError);
		expect(error).toMatchObject({
			expectedKey: "expected",
			receivedKey: key?.toString() ?? null,
		});
	}
}

function topicEnvelopeTests(): void {
	test(
		"rejects malformed envelopes and preserves JSON failure causes",
		rejectsMalformedEnvelopes,
	);
	test(
		"preserves strict version validation and payloads",
		preservesEnvelopeVersions,
	);
	test(
		"preserves null and mismatched key error details",
		preservesKeyMismatchDetails,
	);
}

const createMutation = () => createTrackMutation({});

function rejectsInvalidMeteringPayloads(): void {
	const serialized = serializeMeteringRecord({ record: createMutation() });
	const envelope = JSON.parse(serialized.value.toString("utf8"));
	for (const invalid of [
		{ ...envelope, type: "unknown_record" },
		{ ...envelope, type: "track_outcome" },
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

describe("topicEnvelope", topicEnvelopeTests);
describe("meteringTopic", () => {
	test("round-trips a versioned mutation with its customer partition key", () => {
		const mutation = createMutation();
		const serialized = serializeMeteringRecord({ record: mutation });

		expect(
			parseMeteringRecord({
				key: serialized.key,
				value: serialized.value,
			}),
		).toEqual(mutation);
	});

	test("round-trips optional command sources and refuses invalid offsets", () => {
		const mutation = {
			...createMutation(),
			source: { commandOffset: "9007199254740993" },
		};
		expect(
			parseMeteringRecord(serializeMeteringRecord({ record: mutation })),
		).toEqual(mutation);
		for (const commandOffset of ["-1", "1.5", "not_an_offset"]) {
			expect(() =>
				serializeMeteringRecord({
					record: { ...mutation, source: { commandOffset } },
				}),
			).toThrow(InvalidRecordError);
		}
	});

	test("rejects an unsupported envelope version", () => {
		const serialized = serializeMeteringRecord({ record: createMutation() });
		const envelope = JSON.parse(serialized.value.toString("utf8"));

		expect(() =>
			parseMeteringRecord({
				key: serialized.key,
				value: Buffer.from(
					JSON.stringify({ ...envelope, schemaVersion: 2 }),
					"utf8",
				),
			}),
		).toThrow(UnsupportedRecordVersionError);
	});

	test("rejects a record whose Kafka key names another customer", () => {
		const serialized = serializeMeteringRecord({ record: createMutation() });

		expect(() =>
			parseMeteringRecord({
				key: Buffer.from('["org_1","sandbox","cus_2"]', "utf8"),
				value: serialized.value,
			}),
		).toThrow(RecordKeyMismatchError);
	});

	test("rejects malformed envelopes", () => {
		expect(() =>
			parseMeteringRecord({
				key: Buffer.from("key"),
				value: Buffer.from("not-json", "utf8"),
			}),
		).toThrow(InvalidRecordError);
	});
});
test(
	"rejects unknown or mismatched metering payloads and retains domain validation causes",
	rejectsInvalidMeteringPayloads,
);

test("round-trips an initialize mutation", function roundTripsInitialization() {
	const initialization = createInitializeMutation({});
	const serialized = serializeMeteringRecord({ record: initialization });

	expect(
		parseMeteringRecord({
			key: serialized.key,
			value: serialized.value,
		}),
	).toEqual(initialization);
});
