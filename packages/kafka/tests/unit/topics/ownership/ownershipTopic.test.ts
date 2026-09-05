import { describe, expect, test } from "bun:test";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
} from "../../../../src/lib/recordErrors.js";
import { ownershipTopic } from "../../../../src/topics/ownership/ownershipTopic.js";

const claimed = {
	schemaVersion: 1 as const,
	type: "claimed" as const,
	partition: 7,
	endpoint: "http://10.0.0.4:8080",
	claimedAt: 1_700_000_000_000,
};

describe("ownershipTopic", () => {
	test("round-trips a claim keyed by partition", () => {
		const serialized = ownershipTopic.serialize({ record: claimed });

		expect(serialized.key.toString("utf8")).toBe("7");
		expect(ownershipTopic.parse(serialized)).toEqual(claimed);
	});

	test("round-trips an unowned record", () => {
		const record = {
			schemaVersion: 1 as const,
			type: "unowned" as const,
			partition: 7,
			releasedAt: 1_700_000_000_100,
		};
		const serialized = ownershipTopic.serialize({ record });

		expect(ownershipTopic.parse(serialized)).toEqual(record);
	});

	test("rejects a record whose Kafka key names another partition", () => {
		const serialized = ownershipTopic.serialize({ record: claimed });

		expect(() =>
			ownershipTopic.parse({
				key: Buffer.from("3", "utf8"),
				value: serialized.value,
			}),
		).toThrow(RecordKeyMismatchError);
	});
});

function preservesOwnershipWireBytes(): void {
	const serialized = ownershipTopic.serialize({ record: claimed });
	expect(serialized).toEqual({
		key: Buffer.from("7", "utf8"),
		value: Buffer.from(
			JSON.stringify({ schemaVersion: 1, type: "claimed", payload: claimed }),
			"utf8",
		),
	});
	const envelope = JSON.parse(serialized.value.toString("utf8"));
	for (const invalid of [
		{ ...envelope, type: "unknown_record" },
		{ ...envelope, type: "unowned" },
		{ ...envelope, payload: { ...claimed, extra: true } },
	]) {
		function parse(): void {
			ownershipTopic.parse({
				key: serialized.key,
				value: Buffer.from(JSON.stringify(invalid)),
			});
		}
		expect(parse).toThrow(InvalidRecordError);
	}
	let failure: unknown;
	try {
		ownershipTopic.parse({
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
	"preserves ownership wire bytes and strict payload validation",
	preservesOwnershipWireBytes,
);
