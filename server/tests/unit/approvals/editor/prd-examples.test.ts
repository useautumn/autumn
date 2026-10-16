/**
 * S5 contract with S3: the editor rows for each PRD §8 worked example (A–F)
 * store exactly the example's `filter`, and that filter is valid for its
 * effect. The hand-written shapes (C's nested `$or`, D's allow `$some`) open
 * read-only, and their editor equivalents are editable.
 *
 * Red (before):  no effect, `entity`, `has_paid` or "has a trial" in the editor.
 * Green (after): every example below round-trips.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApprovalFilterKey,
	buildApprovalFilterSchema,
	type EditorGroup,
	type EditorRow,
	type RuleEffect,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const plan = (plan_id: string) => ({ plan_id });

type Example = {
	name: string;
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	groups: EditorGroup;
	filter: unknown;
};

const EXAMPLES: Example[] = [
	{
		name: "A · No billing changes (block, no conditions)",
		shape: "billing_change",
		effect: "block",
		groups: [],
		filter: null,
	},
	{
		name: "A · Sales: Enterprise trials (allow)",
		shape: "billing_change",
		effect: "allow",
		groups: [
			{ field: "paid", operator: "is", value: false },
			{ field: "incoming_plan", operator: "is", value: plan("enterprise") },
			{
				field: "free_trial",
				operator: "lt",
				value: { length: 2, unit: "month" },
			},
		],
		filter: {
			paid: false,
			incoming: {
				$every: {
					plan_id: "enterprise",
					free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
				},
			},
		},
	},
	{
		name: "B · Credit add-ons on the customer (block)",
		shape: "billing_change",
		effect: "block",
		groups: [
			{ field: "entity", operator: "is_entity", value: null },
			{ field: "incoming_plan", operator: "is", value: plan("credits_addon") },
		],
		filter: {
			incoming: { $some: { plan_id: "credits_addon" } },
			entity: { $ne: null },
		},
	},
	{
		name: "D · No Enterprise cancels (block)",
		shape: "billing_cancel",
		effect: "block",
		groups: [
			{ field: "outgoing_plan", operator: "is", value: plan("enterprise") },
		],
		filter: { outgoing: { $some: { plan_id: "enterprise" } } },
	},
	{
		name: "E · Trials for new customers only (block)",
		shape: "billing_change",
		effect: "block",
		groups: [
			{ field: "customer_has_paid", operator: "is", value: true },
			{ field: "incoming_plan", operator: "is", value: plan("enterprise") },
			{ field: "free_trial", operator: "has_any", value: null },
		],
		filter: {
			customer: { has_paid: true },
			incoming: { $some: { plan_id: "enterprise", free_trial: { $ne: null } } },
		},
	},
	{
		name: "F · Sales: no custom pricing (block)",
		shape: "billing_change",
		effect: "block",
		groups: [{ field: "customized", operator: "is", value: true }],
		filter: { incoming: { $some: { customized: true } } },
	},
];

const keysIn = (value: unknown): string[] =>
	value && typeof value === "object"
		? Object.entries(value).flatMap(([key, inner]) => [key, ...keysIn(inner)])
		: [];

describe("PRD §8 examples round-trip", () => {
	test.each(EXAMPLES)("$name", ({ shape, effect, groups, filter }) => {
		const rows = groups.length > 0 ? [groups] : [];
		expect<unknown>(ruleRowsToFilter({ shape, effect, groups: rows })).toEqual({
			ok: true,
			filter,
		});
		expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
			editable: true,
			pinned: null,
			groups: rows,
		});
	});

	// Stands in for S3's validateApprovalRule until S3 freezes: the shape parses, and block rules hold no $every.
	test.each(EXAMPLES.filter((example) => example.filter))(
		"$name is a valid filter for its effect",
		({ shape, effect, filter }) => {
			expect(
				buildApprovalFilterSchema({ key: shape }).safeParse(filter).success,
			).toBe(true);
			if (effect === "block") expect(keysIn(filter)).not.toContain("$every");
		},
	);
});

describe("hand-written examples open read-only; their editor form is editable", () => {
	const deploymentPlans = {
		field: "incoming_plan",
		operator: "is_any_of",
		value: [plan("pro"), plan("enterprise"), plan("hobby")],
	} as EditorRow;

	test.each<{
		name: string;
		shape: ApprovalFilterKey;
		effect: RuleEffect;
		handWritten: unknown;
		editorGroups: EditorGroup[];
	}>([
		{
			name: "C · Plans on deployments: two OR groups instead of a nested $or",
			shape: "billing_change",
			effect: "block",
			handWritten: {
				incoming: {
					$some: { plan_id: { $in: ["pro", "enterprise", "hobby"] } },
				},
				$or: [
					{ entity: null },
					{ entity: { feature_id: { $ne: "deployments" } } },
				],
			},
			editorGroups: [
				[
					{ field: "entity", operator: "is_customer", value: null },
					deploymentPlans,
				],
				[
					{ field: "entity", operator: "is_none_of", value: ["deployments"] },
					deploymentPlans,
				],
			],
		},
		{
			name: "D · Taylor and Kyle cancel Enterprise: the allow stores $every",
			shape: "billing_cancel",
			effect: "allow",
			handWritten: { outgoing: { $some: { plan_id: "enterprise" } } },
			editorGroups: [
				[{ field: "outgoing_plan", operator: "is", value: plan("enterprise") }],
			],
		},
	])("$name", ({ shape, effect, handWritten, editorGroups }) => {
		expect(ruleFilterToRows({ shape, effect, filter: handWritten })).toEqual({
			editable: false,
		});
		const stored = ruleRowsToFilter({ shape, effect, groups: editorGroups });
		if (!stored.ok) throw new Error(JSON.stringify(stored.issues));
		expect(ruleFilterToRows({ shape, effect, filter: stored.filter })).toEqual({
			editable: true,
			pinned: null,
			groups: editorGroups,
		});
	});
});
