import { describe, expect, test } from "bun:test";
import { rowChangeSchema } from "../../../src/models/mutation/rowChange.js";

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

	test("an increment names counters and map entries; a guard is optional", () => {
		const change = rowChangeSchema.parse({
			table: "customerEntitlements",
			op: "increment",
			id: "ce_1",
			add: { balance: -5 },
			addEntries: {
				entities: { ent_1: { balance: -2 } },
				usage_attribution: { feat_a: { units: 3, credits: 0.6 } },
			},
		});
		if (change.op !== "increment") throw new Error("Expected an increment");

		expect(change.add).toEqual({ balance: -5 });
		expect(change.guard).toBeUndefined();
		expect(
			rowChangeSchema.parse({
				table: "usageWindows",
				op: "increment",
				id: "uw_1",
				add: { usage: 2 },
				guard: { window_start_at: 1, window_end_at: 2 },
			}).op,
		).toBe("increment");
	});

	test("an increment refuses anything that is not a counter of its table", () => {
		const refused = [
			{ table: "customerEntitlements", add: { usage: 1 } },
			{ table: "customerEntitlements", add: { next_reset_at: 1 } },
			{ table: "usageWindows", add: { updated_at: 1 } },
			{ table: "rollovers", add: { balance: "5" } },
			{
				table: "customerEntitlements",
				add: {},
				addEntries: { usage_attribution: { feat_a: { balance: 1 } } },
			},
			{ table: "usageWindows", add: {}, addEntries: { entities: {} } },
			{ table: "customerProducts", add: { quantity: 1 } },
		];
		for (const input of refused) {
			expect(
				rowChangeSchema.safeParse({ op: "increment", id: "row_1", ...input })
					.success,
			).toBe(false);
		}
	});
});
