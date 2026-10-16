/**
 * S5 contract with S3: the editor rows for each PRD §8 worked example
 * (`rules.prdExamples()`) store exactly that rule's `filter`, and the rule
 * passes S3's validator. The hand-written shapes (C's nested `$or`, D's allow
 * `$some`) open read-only, and their editor equivalents are editable.
 *
 * Red (before):  no effect, `entity`, `has_paid` or "has a trial" in the editor.
 * Green (after): every example round-trips or opens read-only as listed.
 */

import { describe, expect, test } from "bun:test";
import {
	ACTIONS,
	type ApprovalFilterKey,
	type ApprovalRuleParams,
	validateApprovalRule,
} from "@autumn/shared";
import {
	type EditorGroup,
	type EditorRow,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";

const plan = (plan_id: string) => ({ plan_id });
const examples = rules.prdExamples();
const example = (name: string) => {
	const rule = examples.find((candidate) => candidate.name === name);
	if (!rule) throw new Error(`No PRD example named ${name}`);
	return rule;
};

const shapeOf = (rule: ApprovalRuleParams) =>
	ACTIONS[rule.actions[0]].filter as ApprovalFilterKey;

const deploymentPlans = {
	field: "incoming_plan",
	operator: "is_any_of",
	value: [plan("pro"), plan("enterprise"), plan("hobby")],
} as EditorRow;

/** Each editable example's rows, in board order. */
const EDITABLE: Record<string, EditorGroup[]> = {
	"No billing changes": [],
	"Sales: Enterprise trials": [
		[
			{ field: "paid", operator: "is", value: false },
			{ field: "incoming_plan", operator: "is", value: plan("enterprise") },
			{
				field: "free_trial",
				operator: "lt",
				value: { length: 2, unit: "month" },
			},
		],
	],
	"Credit add-ons on the customer": [
		[
			{ field: "entity", operator: "is_entity", value: null },
			{ field: "incoming_plan", operator: "is", value: plan("credits_addon") },
		],
	],
	"No Enterprise cancels": [
		[{ field: "outgoing_plan", operator: "is", value: plan("enterprise") }],
	],
	"Trials for new customers only": [
		[
			{ field: "customer_has_paid", operator: "is", value: true },
			{ field: "incoming_plan", operator: "is", value: plan("enterprise") },
			{ field: "free_trial", operator: "has_any", value: null },
		],
	],
	"Sales: no custom pricing": [
		[{ field: "customized", operator: "is", value: true }],
	],
};

/** The hand-written examples, and how the editor writes the same rule. */
const HAND_WRITTEN: Record<string, EditorGroup[]> = {
	"Plans on deployments": [
		[
			{ field: "entity", operator: "is_customer", value: null },
			deploymentPlans,
		],
		[
			{ field: "entity", operator: "is_none_of", value: ["deployments"] },
			deploymentPlans,
		],
	],
	"Taylor and Kyle cancel Enterprise": [
		[{ field: "outgoing_plan", operator: "is", value: plan("enterprise") }],
	],
};

test("every PRD example is covered here", () => {
	expect(examples.map((rule) => rule.name).sort()).toEqual(
		[...Object.keys(EDITABLE), ...Object.keys(HAND_WRITTEN)].sort(),
	);
});

describe("PRD §8 examples round-trip", () => {
	test.each(Object.entries(EDITABLE))("%s", (name, groups) => {
		const rule = example(name);
		const shape = shapeOf(rule);
		const { effect, filter } = rule;
		expect<unknown>(ruleRowsToFilter({ shape, effect, groups })).toEqual({
			ok: true,
			filter,
		});
		expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
			editable: true,
			pinned: null,
			groups,
		});
		expect(validateApprovalRule({ rule }).ok).toBe(true);
	});
});

describe("hand-written examples open read-only; their editor form is editable and valid", () => {
	test.each(Object.entries(HAND_WRITTEN))("%s", (name, groups) => {
		const rule = example(name);
		const shape = shapeOf(rule);
		const { effect } = rule;
		expect(ruleFilterToRows({ shape, effect, filter: rule.filter })).toEqual({
			editable: false,
		});
		const stored = ruleRowsToFilter({ shape, effect, groups });
		if (!stored.ok) throw new Error(JSON.stringify(stored.issues));
		expect(ruleFilterToRows({ shape, effect, filter: stored.filter })).toEqual({
			editable: true,
			pinned: null,
			groups,
		});
		const result = validateApprovalRule({
			rule: { ...rule, filter: stored.filter },
		});
		expect(result.ok ? [] : result.issues).toEqual([]);
	});
});
