import { describe, expect, test } from "bun:test";
import { parseMutationRecord } from "../../../src/balanceEngine.js";
import { createEvictRecord } from "../engineFixtures.js";

const roundTrip = (input: unknown) =>
	parseMutationRecord({ input: JSON.parse(JSON.stringify(input)) });

describe("a logged evict", () => {
	test("is a mutation record with no changes, and survives JSON", () => {
		const record = createEvictRecord({ revisionBefore: 4 });

		expect(roundTrip(record)).toEqual(record);
		expect(record.command.type).toBe("evict");
		expect(record.changes).toEqual([]);
		expect(record.revision).toEqual({ before: 4, after: 5 });
	});

	test("carrying a row change is refused: nothing moves on an evict", () => {
		const record = createEvictRecord();
		const withChange = {
			...record,
			changes: [
				{
					table: "customer",
					op: "update",
					id: record.identity.customerId,
					before: { name: null },
					after: { name: "Acme" },
				},
			],
		};

		expect(() => roundTrip(withChange)).toThrow(
			"An evict carries no row changes",
		);
	});

	test("its id must be the command id, like every logged command", () => {
		const record = createEvictRecord();

		expect(() => roundTrip({ ...record, id: "another_id" })).toThrow(
			"the record id is the command id",
		);
	});
});
