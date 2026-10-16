/**
 * S5 contract: the Customer rows every area shares ("Customer", "Customer
 * has plan": has / doesn't have / has none, and "Customer has paid before")
 * store under `customer` and read back as the same rows, whatever the effect.
 *
 * Red (before):  no `effect` param and no `customer_has_paid` field.
 * Green (after): each row stores as listed, in every area that offers it.
 */

import { expect, test } from "bun:test";
import {
	type ApprovalFilterKey,
	EDITOR_FIELDS,
	type EditorRow,
	type RuleEffect,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const SHAPES = (Object.keys(EDITOR_FIELDS) as ApprovalFilterKey[]).filter(
	(shape) => "customer" in EDITOR_FIELDS[shape],
);
const EFFECTS: RuleEffect[] = ["allow", "block"];

const enterprise = { plan_id: "enterprise" };

const CASES: { name: string; rows: EditorRow[]; filter: unknown }[] = [
	{
		name: "Customer is",
		rows: [{ field: "customer", operator: "is", value: "acme" }],
		filter: { customer: { customer_id: "acme" } },
	},
	{
		name: "Customer is none of",
		rows: [{ field: "customer", operator: "is_none_of", value: ["a", "b"] }],
		filter: { customer: { customer_id: { $nin: ["a", "b"] } } },
	},
	{
		name: "Customer has plan, any version",
		rows: [{ field: "customer_plan", operator: "has", value: enterprise }],
		filter: { customer: { plan: { $some: enterprise } } },
	},
	{
		name: "Customer has plan, pinned version",
		rows: [
			{
				field: "customer_plan",
				operator: "has",
				value: { ...enterprise, version: 2 },
			},
		],
		filter: { customer: { plan: { $some: { ...enterprise, version: 2 } } } },
	},
	{
		name: "Customer doesn't have plan",
		rows: [
			{ field: "customer_plan", operator: "doesnt_have", value: enterprise },
		],
		filter: { customer: { plan: { $none: enterprise } } },
	},
	{
		name: "Customer has no plan",
		rows: [{ field: "customer_plan", operator: "has_none", value: null }],
		filter: { customer: { plan: { $none: {} } } },
	},
	{
		name: "Customer has paid before",
		rows: [{ field: "customer_has_paid", operator: "is", value: true }],
		filter: { customer: { has_paid: true } },
	},
	{
		name: "Customer, has plan and has paid share one customer filter",
		rows: [
			{ field: "customer", operator: "is_not", value: "acme" },
			{ field: "customer_plan", operator: "has", value: enterprise },
			{ field: "customer_has_paid", operator: "is", value: false },
		],
		filter: {
			customer: {
				customer_id: { $ne: "acme" },
				plan: { $some: enterprise },
				has_paid: false,
			},
		},
	},
];

const cells = SHAPES.flatMap((shape) =>
	EFFECTS.flatMap((effect) => CASES.map((c) => ({ shape, effect, ...c }))),
);

test.each(cells)(
	"$shape · $effect · $name",
	({ shape, effect, rows, filter }) => {
		expect<unknown>(
			ruleRowsToFilter({ shape, effect, groups: [rows] }),
		).toEqual({
			ok: true,
			filter,
		});
		expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
			editable: true,
			groups: [rows],
		});
	},
);
