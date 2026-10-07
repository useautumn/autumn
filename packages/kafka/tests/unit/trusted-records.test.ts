import { expect, test } from "bun:test";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
} from "../../src/lib/recordErrors.js";
import {
	parseMeteringRecord,
	parseTrustedMeteringRecord,
	serializeMeteringRecord,
} from "../../src/topics/metering/meteringTopic.js";
import { createTrackMutation } from "../meteringFixtures.js";

test("a trusted parse reads the same record the full parse does", () => {
	const encoded = serializeMeteringRecord({ record: createTrackMutation() });
	expect(parseTrustedMeteringRecord(encoded)).toEqual(
		parseMeteringRecord(encoded),
	);
});

test("a trusted parse still refuses a record missing what readers lean on", () => {
	const { key, value } = serializeMeteringRecord({
		record: createTrackMutation(),
	});
	const envelope = JSON.parse(value.toString("utf8"));
	delete envelope.payload.identity;
	expect(() =>
		parseTrustedMeteringRecord({
			key,
			value: Buffer.from(JSON.stringify(envelope)),
		}),
	).toThrow(InvalidRecordError);
});

test("a trusted parse still refuses a record under another subject's key", () => {
	const { value } = serializeMeteringRecord({ record: createTrackMutation() });
	expect(() =>
		parseTrustedMeteringRecord({ key: Buffer.from('["other"]'), value }),
	).toThrow(RecordKeyMismatchError);
});
