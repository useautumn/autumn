import { describe, expect, test } from "bun:test";
import { foldSubjectRowChanges } from "../../../src/subjects/repos/applySubjectRowUpdates/foldSubjectRowChanges.js";
import type { SubjectRowChange } from "../../../src/subjects/types/subjectRowChange.js";

type Update = Extract<SubjectRowChange, { op: "update" }>;
const update = (
	fields: Partial<Update> & Pick<Update, "table" | "id">,
): SubjectRowChange => ({
	op: "update",
	set: {},
	add: {},
	addEntries: {},
	guard: {},
	...fields,
});

describe("foldSubjectRowChanges", () => {
	test("adds to one row sum, other rows keep their place, and every input maps to its folded row", () => {
		const { folded, foldedIndexOf } = foldSubjectRowChanges({
			changes: [
				update({
					table: "customerEntitlements",
					id: "ce_1",
					add: { balance: -5 },
				}),
				update({
					table: "rollovers",
					id: "ro_1",
					add: { balance: -1, usage: 1 },
				}),
				update({
					table: "customerEntitlements",
					id: "ce_1",
					add: { balance: -3, adjustment: 1 },
				}),
			],
		});
		expect(folded).toEqual([
			update({
				table: "customerEntitlements",
				id: "ce_1",
				add: { balance: -8, adjustment: 1 },
			}),
			update({
				table: "rollovers",
				id: "ro_1",
				add: { balance: -1, usage: 1 },
			}),
		]);
		expect(foldedIndexOf).toEqual([0, 1, 0]);
	});

	test("a window roll then consumes: the set wins over earlier adds, later adds move the set value, the first guard stays", () => {
		const { folded } = foldSubjectRowChanges({
			changes: [
				update({
					table: "usageWindows",
					id: "uw_1",
					add: { usage: 2 },
					guard: { window_start_at: 1 },
				}),
				update({
					table: "usageWindows",
					id: "uw_1",
					set: { usage: 0, window_start_at: 2, window_end_at: 3 },
					guard: { usage: 7, window_start_at: 1 },
				}),
				update({
					table: "usageWindows",
					id: "uw_1",
					add: { usage: 5 },
					guard: { window_start_at: 2 },
				}),
			],
		});
		expect(folded).toEqual([
			update({
				table: "usageWindows",
				id: "uw_1",
				set: { usage: 5, window_start_at: 2, window_end_at: 3 },
				guard: { window_start_at: 1 },
			}),
		]);
	});

	test("map entries sum per key and field, and land on a set map value when one is present", () => {
		const { folded } = foldSubjectRowChanges({
			changes: [
				update({
					table: "customerEntitlements",
					id: "ce_1",
					addEntries: { entities: { ent_1: { balance: -1 } } },
				}),
				update({
					table: "customerEntitlements",
					id: "ce_1",
					addEntries: {
						entities: {
							ent_1: { balance: -2, adjustment: 1 },
							ent_2: { balance: -4 },
						},
					},
				}),
				update({
					table: "customerEntitlements",
					id: "ce_2",
					set: { entities: { ent_9: { id: "ent_9", balance: 10 } } },
				}),
				update({
					table: "customerEntitlements",
					id: "ce_2",
					addEntries: {
						entities: { ent_9: { balance: -4 }, ent_10: { balance: 1 } },
					},
				}),
			],
		});
		expect((folded[0] as Update).addEntries).toEqual({
			entities: {
				ent_1: { balance: -3, adjustment: 1 },
				ent_2: { balance: -4 },
			},
		});
		expect((folded[1] as Update).set).toEqual({
			entities: {
				ent_9: { id: "ent_9", balance: 6 },
				ent_10: { id: "ent_10", balance: 1 },
			},
		});
		expect((folded[1] as Update).addEntries).toEqual({});
	});

	test("a new window consumed in the same flush is one insert with the counters already moved", () => {
		const { folded, foldedIndexOf } = foldSubjectRowChanges({
			changes: [
				{
					op: "insert",
					table: "usageWindows",
					row: { id: "uw_1", usage: 0, window_start_at: 1 },
				},
				update({
					table: "usageWindows",
					id: "uw_1",
					add: { usage: 5 },
					guard: { window_start_at: 1 },
				}),
				update({ table: "usageWindows", id: "uw_1", set: { updated_at: 9 } }),
			],
		});
		expect(folded).toEqual([
			{
				op: "insert",
				table: "usageWindows",
				row: { id: "uw_1", usage: 5, window_start_at: 1, updated_at: 9 },
			},
		]);
		expect(foldedIndexOf).toEqual([0, 0, 0]);
	});

	test("insert then delete cancels out; update then delete is a delete; delete then insert replaces every column", () => {
		const { folded, foldedIndexOf } = foldSubjectRowChanges({
			changes: [
				{ op: "insert", table: "rollovers", row: { id: "ro_1", balance: 3 } },
				update({
					table: "customerEntitlements",
					id: "ce_1",
					add: { balance: -1 },
				}),
				{ op: "delete", table: "rollovers", id: "ro_1" },
				{ op: "delete", table: "customerEntitlements", id: "ce_1" },
				{ op: "delete", table: "rollovers", id: "ro_2" },
				{
					op: "insert",
					table: "rollovers",
					row: { id: "ro_2", balance: 8, usage: 0 },
				},
			],
		});
		expect(folded).toEqual([
			{ op: "delete", table: "customerEntitlements", id: "ce_1" },
			update({
				table: "rollovers",
				id: "ro_2",
				set: { id: "ro_2", balance: 8, usage: 0 },
			}),
		]);
		expect(foldedIndexOf).toEqual([null, 0, null, 0, 1, 1]);
	});

	test("refuses a row inserted twice, deleted twice, or updated after its delete", () => {
		const insert: SubjectRowChange = {
			op: "insert",
			table: "rollovers",
			row: { id: "ro_1" },
		};
		expect(() => foldSubjectRowChanges({ changes: [insert, insert] })).toThrow(
			"inserted twice",
		);
		const remove: SubjectRowChange = {
			op: "delete",
			table: "rollovers",
			id: "ro_1",
		};
		expect(() => foldSubjectRowChanges({ changes: [remove, remove] })).toThrow(
			"deleted twice",
		);
		expect(() =>
			foldSubjectRowChanges({
				changes: [
					remove,
					update({ table: "rollovers", id: "ro_1", add: { usage: 1 } }),
				],
			}),
		).toThrow("updated after delete");
	});

	test("a customer inserted and updated in one flush folds on internal_id into one insert", () => {
		const { folded, foldedIndexOf } = foldSubjectRowChanges({
			changes: [
				{
					op: "insert",
					table: "customers",
					row: { internal_id: "cus_internal_1", id: "cus_1", processor: null },
				},
				{
					op: "update",
					table: "customers",
					id: "cus_internal_1",
					set: { processor: { id: "cus_stripe_1" } },
					add: {},
					addEntries: {},
					guard: { processor: null },
				},
			],
		});
		expect(folded).toEqual([
			{
				op: "insert",
				table: "customers",
				row: {
					internal_id: "cus_internal_1",
					id: "cus_1",
					processor: { id: "cus_stripe_1" },
				},
			},
		]);
		expect(foldedIndexOf).toEqual([0, 0]);
	});

	test("two customers sharing an external id stay two rows", () => {
		const { folded } = foldSubjectRowChanges({
			changes: [
				{
					op: "insert",
					table: "customers",
					row: { internal_id: "cus_internal_1", id: "cus_1" },
				},
				{
					op: "insert",
					table: "customers",
					row: { internal_id: "cus_internal_2", id: "cus_1" },
				},
			],
		});
		expect(folded).toHaveLength(2);
	});
});
