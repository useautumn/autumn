import { describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import { InvalidRecordError } from "../../src/lib/recordErrors.js";
import {
	assembleRecord,
	encodeDecision,
	encodeDecisionInto,
	maxDecisionBytes,
	meteringRecordJson,
	splitMeteringRecord,
} from "../../src/topics/metering/meteringRecordSplice.js";
import { serializeMeteringRecord } from "../../src/topics/metering/meteringTopic.js";
import type { MeteringRecord } from "../../src/topics/metering/types/meteringRecord.js";
import {
	createInitializeMutation,
	createTrackMutation,
	testIdentity,
} from "../meteringFixtures.js";

const commandBytesOf = (record: MeteringRecord): Uint8Array =>
	new TextEncoder().encode(JSON.stringify(record.command));

const expectSpliceEquals = (record: MeteringRecord): void => {
	const expected = serializeMeteringRecord({ record });
	const assembled = assembleRecord({
		decisionBytes: encodeDecision({ record }),
		commandBytes: commandBytesOf(record),
	});
	expect(assembled.key.equals(expected.key)).toBe(true);
	expect(assembled.value.toString("utf8")).toBe(
		expected.value.toString("utf8"),
	);
	expect(assembled.value.equals(expected.value)).toBe(true);
};

describe("metering record splice", () => {
	test("a track record assembled from its decision and command bytes is byte-identical to serializeMeteringRecord", () => {
		expectSpliceEquals(createTrackMutation({ commandId: "cmd_1" }));
	});

	test("an initialize record (effects, source) splices the same way", () => {
		const record = createInitializeMutation();
		expectSpliceEquals({
			...record,
			effects: [],
			source: { commandOffset: "7" },
		} as MeteringRecord);
	});

	test("non-ASCII text on both sides of the command keeps the byte lengths right", () => {
		const record = createTrackMutation({ commandId: "cmd_ü_日本" });
		expectSpliceEquals({
			...record,
			command: { ...record.command, properties: { note: "héllo 🙂" } },
		} as MeteringRecord);
	});

	test("the command may be the first or the last key, and undefined fields are dropped as JSON.stringify drops them", () => {
		const record = createTrackMutation();
		const { command, ...rest } = record;
		expectSpliceEquals({ command, ...rest } as MeteringRecord);
		expectSpliceEquals({ ...rest, command } as MeteringRecord);
		expectSpliceEquals({
			...record,
			effects: undefined,
			source: undefined,
		} as unknown as MeteringRecord);
	});

	test("the record's text is serializeMeteringRecord's value, uncached", () => {
		const record = createTrackMutation();
		expect(meteringRecordJson({ record })).toBe(
			serializeMeteringRecord({ record }).value.toString("utf8"),
		);
	});

	test("a caller-supplied partition key replaces the derived one verbatim", () => {
		const record = createTrackMutation();
		const derived = meteringIdentityToPartitionKey({ identity: testIdentity });
		expect(splitMeteringRecord({ record }).key).toBe(derived);
		expect(splitMeteringRecord({ record, partitionKey: "k" }).key).toBe("k");
	});

	test("encodeDecisionInto writes at the offset within maxDecisionBytes and reports the length", () => {
		const record = createTrackMutation();
		const split = splitMeteringRecord({ record });
		const target = new Uint8Array(16 + maxDecisionBytes({ split }));
		const length = encodeDecisionInto({ split, target, offset: 16 });
		expect(length).toBeLessThanOrEqual(maxDecisionBytes({ split }));
		const assembled = assembleRecord({
			decisionBytes: target.subarray(16, 16 + length),
			commandBytes: commandBytesOf(record),
		});
		expect(
			assembled.value.equals(serializeMeteringRecord({ record }).value),
		).toBe(true);
	});

	test("a record without a command, or not a mutation, is refused", () => {
		const record = createTrackMutation();
		expect(() =>
			splitMeteringRecord({
				record: { ...record, command: undefined } as unknown as MeteringRecord,
			}),
		).toThrow(InvalidRecordError);
		expect(() =>
			splitMeteringRecord({
				record: { ...record, type: "other" } as unknown as MeteringRecord,
			}),
		).toThrow(InvalidRecordError);
	});
});
