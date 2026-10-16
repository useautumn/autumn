/**
 * S5 contract: plan pickers, Quantity and optional amounts store by effect.
 * Block rules use `$some` and no "or none" branch; allow rules use `$every`
 * and caps that also pass when there's nothing to cap. "Is not" is `$none`
 * under both.
 *
 * Red (before):  plan rows always store `$every`, Quantity always the allow
 * cap, and an amount cap always adds a null branch.
 * Green (after): each case stores and reads back as listed.
 */

import { expect, test } from "bun:test";
import type {
	ApprovalFilterKey,
	ApprovalRuleEffect as RuleEffect,
} from "@autumn/shared";
import {
	type EditorRow,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const seats = (
	operator: EditorRow["operator"],
	quantity: number,
): EditorRow => ({
	field: "feature_quantity",
	operator,
	value: { feature_id: "seats", quantity },
});

const CASES: {
	name: string;
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	rows: EditorRow[];
	filter: unknown;
}[] = [
	{
		name: "block: incoming plan is any of Pro, Enterprise stores $some with $in",
		shape: "billing_change",
		effect: "block",
		rows: [
			{
				field: "incoming_plan",
				operator: "is_any_of",
				value: [{ plan_id: "pro" }, { plan_id: "enterprise" }],
			},
		],
		filter: {
			incoming: { $some: { plan_id: { $in: ["pro", "enterprise"] } } },
		},
	},
	{
		name: "allow: incoming plan is Pro stores $every",
		shape: "billing_change",
		effect: "allow",
		rows: [
			{ field: "incoming_plan", operator: "is", value: { plan_id: "pro" } },
		],
		filter: { incoming: { $every: { plan_id: "pro" } } },
	},
	...(["allow", "block"] as const).map((effect) => ({
		name: "is not stores $none",
		shape: "billing_change" as const,
		effect,
		rows: [
			{
				field: "outgoing_plan",
				operator: "is_not",
				value: { plan_id: "enterprise" },
			} as EditorRow,
		],
		filter: { outgoing: { $none: { plan_id: "enterprise" } } },
	})),
	{
		name: "block: seats quantity > 100 stores feature_quantities.$some",
		shape: "billing_change",
		effect: "block",
		rows: [seats("gt", 100)],
		filter: {
			incoming: {
				$some: {
					feature_quantities: {
						$some: { feature_id: "seats", quantity: { $gt: 100 } },
					},
				},
			},
		},
	},
	{
		name: "allow: seats quantity ≤ 10 keeps the $none cap",
		shape: "billing_change",
		effect: "allow",
		rows: [seats("lte", 10)],
		filter: {
			incoming: {
				$every: {
					feature_quantities: {
						$none: { feature_id: "seats", quantity: { $gt: 10 } },
					},
				},
			},
		},
	},
	{
		name: "block: refund ≤ 50 has no null branch",
		shape: "billing_cancel",
		effect: "block",
		rows: [{ field: "refund", operator: "lte", value: 50 }],
		filter: { refund: { amount: { $lte: 50 } } },
	},
	{
		name: "allow: refund ≤ 50 keeps the no-refund branch",
		shape: "billing_cancel",
		effect: "allow",
		rows: [{ field: "refund", operator: "lte", value: 50 }],
		filter: { $or: [{ refund: null }, { refund: { amount: { $lte: 50 } } }] },
	},
	{
		name: "block: next cycle total > 500 has no null branch",
		shape: "billing_change",
		effect: "block",
		rows: [{ field: "next_cycle_total", operator: "gt", value: 500 }],
		filter: { next_cycle: { total: { $gt: 500 } } },
	},
	{
		name: "block: current plan is not reads back as Customer doesn't have plan",
		shape: "billing_change",
		effect: "block",
		rows: [
			{
				field: "customer_plan",
				operator: "doesnt_have",
				value: { plan_id: "enterprise" },
			},
		],
		filter: { customer: { plan: { $none: { plan_id: "enterprise" } } } },
	},
	{
		name: "allow: current plan is any of means every current plan matches",
		shape: "billing_change",
		effect: "allow",
		rows: [
			{
				field: "current_plan",
				operator: "is_any_of",
				value: [{ plan_id: "starter" }, { plan_id: "pro" }],
			},
		],
		filter: {
			customer: { plan: { $every: { plan_id: { $in: ["starter", "pro"] } } } },
		},
	},
];

test.each(CASES)("$name", ({ shape, effect, rows, filter }) => {
	expect<unknown>(ruleRowsToFilter({ shape, effect, groups: [rows] })).toEqual({
		ok: true,
		filter,
	});
	expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
		editable: true,
		pinned: null,
		groups: [rows],
	});
});

test("block: current plan is reads back as Customer has plan", () => {
	const enterprise = { plan_id: "enterprise" };
	const filter = { customer: { plan: { $some: enterprise } } };
	expect<unknown>(
		ruleRowsToFilter({
			shape: "billing_change",
			effect: "block",
			groups: [[{ field: "current_plan", operator: "is", value: enterprise }]],
		}),
	).toEqual({ ok: true, filter });
	expect(
		ruleFilterToRows({ shape: "billing_change", effect: "block", filter }),
	).toEqual({
		editable: true,
		pinned: null,
		groups: [[{ field: "customer_plan", operator: "has", value: enterprise }]],
	});
});

test("customer plan rows never share an element: has A and current plan is one of are two checks", () => {
	const rows: EditorRow[] = [
		{ field: "customer_plan", operator: "has", value: { plan_id: "a" } },
		{
			field: "current_plan",
			operator: "is_any_of",
			value: [{ plan_id: "b", version: 2 }, { plan_id: "c" }],
		},
	];
	expect<unknown>(
		ruleRowsToFilter({
			shape: "billing_change",
			effect: "block",
			groups: [rows],
		}),
	).toEqual({
		ok: true,
		filter: {
			customer: { plan: { $some: { plan_id: "a" } } },
			$and: [
				{
					customer: {
						plan: {
							$some: { $or: [{ plan_id: "b", version: 2 }, { plan_id: "c" }] },
						},
					},
				},
			],
		},
	});
});
