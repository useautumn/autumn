/**
 * S3 contract: `validateApprovalRule` returns `{ ok: true, rule }` or every
 * problem as `{ path, message }` the dashboard can show next to the field.
 *
 * Red (before):  `validateApprovalRule` doesn't exist.
 * Green (after): each invalid row yields an issue at the listed path.
 */

import { describe, expect, test } from "bun:test";
import { validateApprovalRule } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";

/** Builds a rule from raw JSON, so invalid shapes don't need casts. */
const invalid = (overrides: Record<string, unknown>) => ({
	...rules.rule(),
	...overrides,
});

const issuesOf = (rule: unknown) => {
	const result = validateApprovalRule(rule);
	return result.ok ? [] : result.issues;
};

const REJECTED: { name: string; rule: unknown; path: string }[] = [
	// Ids get rewritten on rename, so pattern matchers on them can't stay correct.
	{
		name: "$regex on customer_id",
		rule: invalid({ when: { customer: { customer_id: { $regex: "^acme" } } } }),
		path: "when.customer.customer_id",
	},
	{
		name: "$startsWith on an incoming plan_id",
		rule: invalid({
			when: { incoming: { $every: { plan_id: { $startsWith: "ent" } } } },
		}),
		path: "when.incoming.$every.plan_id",
	},
	{
		name: "$regex on a nested item feature_id",
		rule: invalid({
			when: {
				outgoing: {
					$none: { item: { $some: { feature_id: { $regex: "seat" } } } },
				},
			},
		}),
		path: "when.outgoing.$none.item.$some.feature_id",
	},
	{
		name: "$startsWith on a plan id inside $or",
		rule: invalid({
			when: {
				$or: [
					{ paid: false },
					{ customer: { plan: { $some: { plan_id: { $startsWith: "p" } } } } },
				],
			},
		}),
		path: "when.$or.1.customer.plan.$some.plan_id",
	},
	// Bare array filters mean $some, which gets caps wrong on empty lists.
	{
		name: "bare discounts filter",
		rule: invalid({ when: { discounts: { percent_off: { $lte: 20 } } } }),
		path: "when.discounts",
	},
	{
		name: "bare incoming filter",
		rule: invalid({ when: { incoming: { plan_id: "pro" } } }),
		path: "when.incoming",
	},
	{
		name: "bare customer plan filter",
		rule: invalid({ when: { customer: { plan: { plan_id: "pro" } } } }),
		path: "when.customer.plan",
	},
	{
		name: "bare item filter nested in a quantifier",
		rule: invalid({
			when: { incoming: { $every: { item: { feature_id: "sso" } } } },
		}),
		path: "when.incoming.$every.item",
	},
	{
		name: "bare feature_quantities filter",
		rule: invalid({
			when: {
				incoming: { $every: { feature_quantities: { quantity: { $lte: 5 } } } },
			},
		}),
		path: "when.incoming.$every.feature_quantities",
	},
	// Balances rules are always about one feature.
	{
		name: "grant credits with no when",
		rule: invalid({ actions: ["balances.create"], when: null }),
		path: "when.feature_id",
	},
	{
		name: "set balance with no feature",
		rule: invalid({
			actions: ["balances.update"],
			when: { remaining: { $lte: 10 } },
		}),
		path: "when.feature_id",
	},
	{
		name: "feature only inside $or",
		rule: invalid({
			actions: ["balances.create"],
			when: { $or: [{ feature_id: "ai_credits" }, { feature_id: "messages" }] },
		}),
		path: "when.feature_id",
	},
	// Edit plans + Edit features together share no fields.
	{
		name: "catalog plans + features with a plan condition",
		rule: invalid({
			actions: ["catalog.edit_plans", "catalog.edit_features"],
			when: { plan_id: "pro" },
		}),
		path: "when",
	},
	// Operators that don't fit the field's type.
	{
		name: "$lt on a bool",
		rule: invalid({ when: { paid: { $lt: 1 } } }),
		path: "when.paid",
	},
	{
		name: "string for money",
		rule: invalid({ when: { total: "lots" } }),
		path: "when.total",
	},
	{
		name: "$regex on a number",
		rule: invalid({ when: { total: { $regex: "1" } } }),
		path: "when.total.$regex",
	},
	// A bad value under a quantifier fails the quantifier as a whole.
	{
		name: "free trial length as a string",
		rule: invalid({
			when: {
				incoming: { $every: { free_trial: { duration_length: { $lt: "2" } } } },
			},
		}),
		path: "when.incoming.$every",
	},
];

describe("validateApprovalRule: rejected", () => {
	test.each(REJECTED)("$name → $path", ({ rule, path }) => {
		const issues = issuesOf(rule);
		expect(issues.map((i) => i.path)).toContain(path);
		for (const issue of issues) expect(issue.message.length).toBeGreaterThan(0);
	});
});

describe("validateApprovalRule: messages", () => {
	test("cross-area actions name both areas", () => {
		expect(
			issuesOf(invalid({ actions: ["billing.attach", "balances.create"] })),
		).toContainEqual({
			path: "actions",
			message:
				"All actions in a rule must be from one area (got Billing and Balances).",
		});
	});

	test("grant credits without a feature", () => {
		expect(
			issuesOf(invalid({ actions: ["balances.create"], when: null })),
		).toContainEqual({
			path: "when.feature_id",
			message: "Grant credits rules must choose a feature.",
		});
	});

	test("starts with on a plan id", () => {
		expect(
			issuesOf(
				invalid({
					when: { incoming: { $every: { plan_id: { $startsWith: "ent" } } } },
				}),
			),
		).toContainEqual({
			path: "when.incoming.$every.plan_id",
			message: 'Plan conditions can\'t use "starts with".',
		});
	});
});

describe("validateApprovalRule: accepted", () => {
	test.each([
		{ name: "case 1", rule: rules.enterpriseTrials() },
		{ name: "case 2", rule: rules.recurringDiscounts() },
		{ name: "case 3", rule: rules.supportCancellations() },
		{
			name: "case 4",
			rule: rules.creditGrants({
				maxGrant: 500,
				subjects: [{ type: "role", role: "engineering" }],
			}),
		},
		{
			name: "explicit $some",
			rule: rules.rule({
				when: { customer: { plan: { $some: { plan_id: "pro" } } } },
			}),
		},
		{
			name: "money is major units, not range-checked",
			rule: rules.rule({ when: { total: { $lte: 50000.5 } } }),
		},
	])("$name", ({ rule }) => {
		expect(validateApprovalRule(rule)).toEqual({ ok: true, rule });
	});
});
