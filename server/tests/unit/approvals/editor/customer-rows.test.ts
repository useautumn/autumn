/**
 * S5 contract: the Customer rows every area shares ("Customer" and "Customer
 * has plan": has / doesn't have / has none) store under `customer` with an
 * explicit quantifier and read back as the same rows.
 *
 * Red (before):  `rowsToWhen` / `whenToRows` don't exist.
 * Green (after): each row stores as listed, in every area that offers it.
 */

import { expect, test } from "bun:test";
import type { WhenKey } from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorRow,
	rowsToWhen,
	whenToRows,
} from "@autumn/shared/api/approvals/editor/index.js";

const AREAS = (Object.keys(EDITOR_FIELDS) as WhenKey[]).filter(
	(area) => "customer" in EDITOR_FIELDS[area],
);

const enterprise = { plan_id: "enterprise" };

const CASES: { name: string; rows: EditorRow[]; when: unknown }[] = [
	{
		name: "Customer is",
		rows: [{ field: "customer", operator: "is", value: "acme" }],
		when: { customer: { customer_id: "acme" } },
	},
	{
		name: "Customer is none of",
		rows: [{ field: "customer", operator: "is_none_of", value: ["a", "b"] }],
		when: { customer: { customer_id: { $nin: ["a", "b"] } } },
	},
	{
		name: "Customer has plan, any version",
		rows: [{ field: "customer_plan", operator: "has", value: enterprise }],
		when: { customer: { plan: { $some: enterprise } } },
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
		when: { customer: { plan: { $some: { ...enterprise, version: 2 } } } },
	},
	{
		name: "Customer doesn't have plan",
		rows: [
			{ field: "customer_plan", operator: "doesnt_have", value: enterprise },
		],
		when: { customer: { plan: { $none: enterprise } } },
	},
	{
		name: "Customer has no plan",
		rows: [{ field: "customer_plan", operator: "has_none", value: null }],
		when: { customer: { plan: { $none: {} } } },
	},
	{
		name: "Customer and has plan share one customer filter",
		rows: [
			{ field: "customer", operator: "is_not", value: "acme" },
			{ field: "customer_plan", operator: "has", value: enterprise },
		],
		when: {
			customer: { customer_id: { $ne: "acme" }, plan: { $some: enterprise } },
		},
	},
];

const cells = AREAS.flatMap((area) => CASES.map((c) => ({ area, ...c })));

test.each(cells)("$area · $name", ({ area, rows, when }) => {
	expect<unknown>(rowsToWhen({ area, groups: [rows] })).toEqual({
		ok: true,
		when,
	});
	expect(whenToRows({ area, when })).toEqual({
		editable: true,
		pinned: null,
		groups: [rows],
	});
});

test.each<{
	name: string;
	row: EditorRow;
	when: unknown;
	readsBack?: EditorRow;
}>([
	{
		name: "Current plan is any of: every current plan matches",
		row: {
			field: "current_plan",
			operator: "is_any_of",
			value: [{ plan_id: "starter" }, { plan_id: "pro" }],
		},
		when: {
			customer: { plan: { $every: { plan_id: { $in: ["starter", "pro"] } } } },
		},
	},
	{
		name: "Current plan is not reads back as Customer doesn't have plan",
		row: { field: "current_plan", operator: "is_not", value: enterprise },
		when: { customer: { plan: { $none: enterprise } } },
		readsBack: {
			field: "customer_plan",
			operator: "doesnt_have",
			value: enterprise,
		},
	},
])("billing_change · $name", ({ row, when, readsBack = row }) => {
	const area = "billing_change";
	expect<unknown>(rowsToWhen({ area, groups: [[row]] })).toEqual({
		ok: true,
		when,
	});
	expect(whenToRows({ area, when })).toEqual({
		editable: true,
		pinned: null,
		groups: [[readsBack]],
	});
});
