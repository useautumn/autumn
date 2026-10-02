import { describe, expect, test } from "bun:test";
import { snapshotStateOf } from "../../../../../src/processor/subject/snapshotLoader/rules/snapshotStateOf.js";
import { createState } from "../../../../fixtures/mutations.js";

describe("snapshotStateOf", () => {
	test("a row that parses is the state a full read would answer: revision zero, rows as written", () => {
		const written = { ...createState({ balance: 95 }), revision: 12 };
		const state = snapshotStateOf({ snapshot: written });
		expect(state?.revision).toBe(0);
		expect(state?.customerEntitlements[0]?.balance).toBe(95);
	});

	test("a row that will not parse is nothing: the caller falls through to the rows", () => {
		expect(
			snapshotStateOf({ snapshot: { schemaVersion: 1, nope: true } }),
		).toBeNull();
		expect(snapshotStateOf({ snapshot: "garbage" })).toBeNull();
	});
});
