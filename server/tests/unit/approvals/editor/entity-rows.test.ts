/**
 * S5 contract: the Entity row says where a billing change lands: the customer
 * (`entity: null`), any entity (`$ne: null`), or an entity of some types.
 *
 * Red (before):  no `entity` field; the row reports "This condition isn't available".
 * Green (after): each row stores as listed and reads back, under both effects.
 */

import { expect, test } from "bun:test";
import type { ApprovalRuleEffect as RuleEffect } from "@autumn/shared";
import {
	type EditorRow,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const shape = "billing_change";
const EFFECTS: RuleEffect[] = ["allow", "block"];

const CASES: { name: string; row: EditorRow; filter: unknown }[] = [
	{
		name: "customer level stores entity: null",
		row: { field: "entity", operator: "is_customer", value: null },
		filter: { entity: null },
	},
	{
		name: "on any entity stores $ne null",
		row: { field: "entity", operator: "is_entity", value: null },
		filter: { entity: { $ne: null } },
	},
	{
		name: "entity type is any of stores feature_id $in",
		row: { field: "entity", operator: "is_any_of", value: ["deployments"] },
		filter: { entity: { feature_id: { $in: ["deployments"] } } },
	},
	{
		name: "entity type is none of stores feature_id $nin",
		row: { field: "entity", operator: "is_none_of", value: ["seats", "orgs"] },
		filter: { entity: { feature_id: { $nin: ["seats", "orgs"] } } },
	},
];

const cells = EFFECTS.flatMap((effect) => CASES.map((c) => ({ effect, ...c })));

test.each(cells)("$effect · $name", ({ effect, row, filter }) => {
	expect<unknown>(ruleRowsToFilter({ shape, effect, groups: [[row]] })).toEqual(
		{
			ok: true,
			filter,
		},
	);
	expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
		editable: true,
		groups: [[row]],
	});
});

test("an Entity row with no types chosen reports an issue", () => {
	expect(
		ruleRowsToFilter({
			shape,
			effect: "block",
			groups: [[{ field: "entity", operator: "is_any_of", value: [] }]],
		}),
	).toEqual({
		ok: false,
		issues: [{ group: 0, row: 0, message: expect.any(String) }],
	});
});

test("two Entity rows stay separate checks instead of one invalid object", () => {
	const rows: EditorRow[] = [
		{ field: "entity", operator: "is_entity", value: null },
		{ field: "entity", operator: "is_none_of", value: ["seats"] },
	];
	const filter = {
		entity: { $ne: null },
		$and: [{ entity: { feature_id: { $nin: ["seats"] } } }],
	};
	expect<unknown>(
		ruleRowsToFilter({ shape, effect: "block", groups: [rows] }),
	).toEqual({ ok: true, filter });
	expect(ruleFilterToRows({ shape, effect: "block", filter })).toEqual({
		editable: true,
		groups: [rows],
	});
});

test("PRD example C's hand-written $or opens read-only; its two-group form is editable", () => {
	const plan = { incoming: { $some: { customized: true } } };
	const handWritten = {
		...plan,
		$or: [{ entity: null }, { entity: { feature_id: { $ne: "deployments" } } }],
	};
	expect(
		ruleFilterToRows({ shape, effect: "block", filter: handWritten }),
	).toEqual({ editable: false });

	const groups: EditorRow[][] = [
		[
			{ field: "entity", operator: "is_customer", value: null },
			{ field: "customized", operator: "is", value: true },
		],
		[
			{ field: "entity", operator: "is_none_of", value: ["deployments"] },
			{ field: "customized", operator: "is", value: true },
		],
	];
	const stored = ruleRowsToFilter({ shape, effect: "block", groups });
	if (!stored.ok) throw new Error(JSON.stringify(stored.issues));
	expect(
		ruleFilterToRows({ shape, effect: "block", filter: stored.filter }),
	).toEqual({ editable: true, groups });
});
