import { describe, expect, test } from "bun:test";
import { rowChangeSchema } from "../../../src/models/rowChange.js";

describe("row change", () => {
	test("an update names only the columns it touches; defaults never fill the rest", () => {
		const change = rowChangeSchema.parse({
			table: "customerEntitlements",
			op: "update",
			id: "ce_1",
			before: { balance: 10 },
			after: { balance: 5 },
		});
		if (change.op !== "update") throw new Error("Expected an update");

		expect(change.before).toEqual({ balance: 10 });
		expect(change.after).toEqual({ balance: 5 });
	});

	test("an update refuses columns the row does not have", () => {
		expect(
			rowChangeSchema.safeParse({
				table: "customerEntitlements",
				op: "update",
				id: "ce_1",
				before: { usage: 1 },
				after: { usage: 2 },
			}).success,
		).toBe(false);
	});
});
