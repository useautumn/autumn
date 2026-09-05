import { expect, test } from "bun:test";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "../../../src/lib/recordErrors.js";
import {
	assertTopicRecordKey,
	readTopicEnvelope,
} from "../../../src/lib/topicEnvelope.js";

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
