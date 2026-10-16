/**
 * S3 contract: `validateApprovalRule({ rule })` returns `{ ok: true, rule }` or every
 * problem as `{ path, message }`; `approvalRuleIssuesToError` turns them into a 400.
 *
 * Red (before):  positional param, `when.` paths, no duplicate/effect/update checks, no error helper.
 * Green (after): each invalid row yields an issue at the listed path.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApprovalRule,
	approvalRuleIssuesToError,
	validateApprovalRule,
	validateApprovalRuleUpdate,
} from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";

/** Builds a rule from raw JSON, so invalid shapes don't need casts. */
const raw = (overrides: Record<string, unknown>) => ({
	...rules.block(),
	...overrides,
});
const allowRaw = (overrides: Record<string, unknown>) => ({
	...rules.allow(),
	...overrides,
});

const issuesOf = (rule: unknown) => {
	const result = validateApprovalRule({ rule });
	return result.ok ? [] : result.issues;
};

const REJECTED: { name: string; rule: unknown; path: string }[] = [
	// Ids get rewritten on rename, so pattern matchers on them can't stay correct.
	{
		name: "$regex on customer_id",
		rule: raw({ filter: { customer: { customer_id: { $regex: "^acme" } } } }),
		path: "filter.customer.customer_id",
	},
	{
		name: "$startsWith on an incoming plan_id",
		rule: raw({
			filter: { incoming: { $some: { plan_id: { $startsWith: "ent" } } } },
		}),
		path: "filter.incoming.$some.plan_id",
	},
	{
		name: "$regex on an entity type",
		rule: raw({ filter: { entity: { feature_id: { $regex: "dep" } } } }),
		path: "filter.entity.feature_id",
	},
	{
		name: "$regex on a nested item feature_id",
		rule: raw({
			filter: {
				outgoing: {
					$none: { item: { $some: { feature_id: { $regex: "seat" } } } },
				},
			},
		}),
		path: "filter.outgoing.$none.item.$some.feature_id",
	},
	// A bare array filter means $some; a rule must say which quantifier it means.
	{
		name: "bare discounts filter",
		rule: allowRaw({ filter: { discounts: { percent_off: { $lte: 20 } } } }),
		path: "filter.discounts",
	},
	{
		name: "bare incoming filter",
		rule: raw({ filter: { incoming: { plan_id: "pro" } } }),
		path: "filter.incoming",
	},
	{
		name: "bare customer plan filter",
		rule: raw({ filter: { customer: { plan: { plan_id: "pro" } } } }),
		path: "filter.customer.plan",
	},
	{
		name: "bare item filter nested in a quantifier",
		rule: raw({
			filter: { incoming: { $some: { item: { feature_id: "sso" } } } },
		}),
		path: "filter.incoming.$some.item",
	},
	// $every matches an empty list, so a block on it would hit unrelated requests.
	{
		name: "$every in a block rule",
		rule: raw({ filter: { incoming: { $every: { plan_id: "pro" } } } }),
		path: "filter.incoming.$every",
	},
	{
		name: "$every nested in a block rule",
		rule: raw({
			filter: {
				incoming: {
					$some: { feature_quantities: { $every: { quantity: { $gt: 5 } } } },
				},
			},
		}),
		path: "filter.incoming.$some.feature_quantities.$every",
	},
	// Balances rules are always about one feature.
	{
		name: "grant credits with no filter",
		rule: raw({ actions: ["balances.create"], filter: null }),
		path: "filter.feature_id",
	},
	{
		name: "set balance with no feature",
		rule: raw({
			actions: ["balances.update"],
			filter: { remaining: { $gt: 10 } },
		}),
		path: "filter.feature_id",
	},
	{
		name: "feature only inside $or",
		rule: raw({
			actions: ["balances.create"],
			filter: { $or: [{ feature_id: "a" }, { feature_id: "b" }] },
		}),
		path: "filter.feature_id",
	},
	// Each subject and action is stored once.
	{
		name: "duplicate role",
		rule: raw({
			subjects: [
				{ type: "role", role_id: "sales" },
				{ type: "role", role_id: "sales" },
			],
		}),
		path: "subjects.1",
	},
	{
		name: "duplicate everyone",
		rule: raw({ subjects: [{ type: "everyone" }, { type: "everyone" }] }),
		path: "subjects.1",
	},
	{
		name: "duplicate action",
		rule: raw({ actions: ["billing.attach", "billing.attach"] }),
		path: "actions.1",
	},
	// Groups and incoming plans.
	{
		name: "empty $or in a customer plan filter",
		rule: raw({ filter: { customer: { plan: { $some: { $or: [] } } } } }),
		path: "filter.customer.plan.$some.$or",
	},
	{
		name: "custom on an incoming plan",
		rule: raw({ filter: { incoming: { $some: { custom: true } } } }),
		path: "filter.incoming.$some.custom",
	},
	{
		name: "custom under a top-level $or",
		rule: raw({
			filter: {
				$or: [{ paid: false }, { incoming: { $some: { custom: true } } }],
			},
		}),
		path: "filter.$or.1.incoming.$some.custom",
	},
	// Operators that don't fit the field.
	{
		name: "$lt on a bool",
		rule: raw({ filter: { paid: { $lt: 1 } } }),
		path: "filter.paid",
	},
	{
		name: "string for money",
		rule: raw({ filter: { total: "lots" } }),
		path: "filter.total",
	},
	{
		name: "fractional duration limit",
		rule: raw({
			filter: {
				incoming: {
					$some: {
						free_trial: { duration: { $lt: { length: 1.5, unit: "month" } } },
					},
				},
			},
		}),
		path: "filter.incoming.$some",
	},
	{
		name: "duration length as a string",
		rule: raw({
			filter: {
				incoming: {
					$some: {
						free_trial: { duration: { $lt: { length: "2", unit: "month" } } },
					},
				},
			},
		}),
		path: "filter.incoming.$some",
	},
	// Deferred.
	{
		name: "member actions",
		rule: raw({ actions: ["members.invite"] }),
		path: "actions",
	},
];

describe("validateApprovalRule: rejected", () => {
	test.each(REJECTED)("$name → $path", ({ rule, path }) => {
		const issues = issuesOf(rule);
		expect(issues.map((issue) => issue.path)).toContain(path);
		for (const issue of issues) expect(issue.message.length).toBeGreaterThan(0);
	});
});

describe("validateApprovalRule: messages", () => {
	test("cross-area actions name both areas", () => {
		expect(
			issuesOf(raw({ actions: ["billing.attach", "balances.create"] })),
		).toContainEqual({
			path: "actions",
			message:
				"All actions in a rule must be from one area (got Billing and Balances).",
		});
	});

	test("grant credits without a feature", () => {
		expect(
			issuesOf(raw({ actions: ["balances.create"], filter: null })),
		).toContainEqual({
			path: "filter.feature_id",
			message: "Grant credits rules must choose a feature.",
		});
	});

	test("starts with on a plan id", () => {
		expect(
			issuesOf(
				raw({
					filter: { incoming: { $some: { plan_id: { $startsWith: "ent" } } } },
				}),
			),
		).toContainEqual({
			path: "filter.incoming.$some.plan_id",
			message: 'Plan conditions can\'t use "starts with".',
		});
	});
});

describe("validateApprovalRule: accepted", () => {
	test.each(rules.prdExamples().map((rule) => ({ name: rule.name, rule })))(
		"$name",
		({ rule }) => {
			expect(validateApprovalRule({ rule })).toEqual({ ok: true, rule });
		},
	);

	test("allow rules may use $every and $some", () => {
		const rule = rules.allow({
			filter: {
				discounts: { $every: { percent_off: { $lte: 20 } } },
				outgoing: { $some: { plan_id: "pro" } },
			},
		});
		expect(validateApprovalRule({ rule })).toEqual({ ok: true, rule });
	});

	test("money is major units and isn't range-checked", () => {
		const rule = rules.block({ filter: { total: { $gt: 50000.5 } } });
		expect(validateApprovalRule({ rule })).toEqual({ ok: true, rule });
	});
});

const stored: ApprovalRule = {
	...rules.salesEnterpriseTrials(),
	position: 0,
	id: "apr_1",
	version: 1,
	updated_by: { user_id: "usr_1", name: "Ada" },
	created_at: 1,
	updated_at: 1,
};

describe("validateApprovalRuleUpdate", () => {
	test("changing actions re-checks the stored filter", () => {
		const result = validateApprovalRuleUpdate({
			current: stored,
			patch: { id: "apr_1", actions: ["billing.cancel"] },
		});
		expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toContain(
			"filter.paid",
		);
	});

	test("a patch that keeps the rule valid returns the merged rule", () => {
		const result = validateApprovalRuleUpdate({
			current: stored,
			patch: { id: "apr_1", enabled: false },
		});
		expect(result).toMatchObject({
			ok: true,
			rule: { name: stored.name, enabled: false, filter: stored.filter },
		});
	});
});

describe("approvalRuleIssuesToError", () => {
	test("issues become a 400 invalid_approval_rule with details.issues", () => {
		const issues = [{ path: "effect", message: "Choose can or can't." }];
		const error = approvalRuleIssuesToError({ issues });
		expect(error).toMatchObject({
			statusCode: 400,
			code: "invalid_approval_rule",
			message: "Choose can or can't.",
			details: { issues },
		});
	});
});
