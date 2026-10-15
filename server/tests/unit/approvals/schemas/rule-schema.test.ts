/**
 * S3 contract: `CreateApprovalRuleParamsSchema` / `ApprovalRuleSchema` accept
 * every When fields board shape and reject cross-area or misplaced conditions.
 *
 * Red (before):  the approval schemas don't exist.
 * Green (after): each row parses (or fails) as listed.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApprovalRuleParams,
	ApprovalRuleSchema,
	CreateApprovalRuleParamsSchema,
} from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";

const issuePaths = (rule: unknown) => {
	const result = CreateApprovalRuleParamsSchema.safeParse(rule);
	return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

const VALID: { name: string; rule: ApprovalRuleParams }[] = [
	{ name: "case 1: enterprise trials", rule: rules.enterpriseTrials() },
	{ name: "case 2: recurring discounts", rule: rules.recurringDiscounts() },
	{ name: "case 3: support cancellations", rule: rules.supportCancellations() },
	{
		name: "case 4: user-level credit grant",
		rule: rules.creditGrants({
			maxGrant: 50,
			subjects: [{ type: "user", user_id: "usr_john" }],
		}),
	},
	{
		name: "billing change: every board field",
		rule: rules.rule({
			when: {
				customer: {
					customer_id: { $in: ["cus_1"] },
					plan: { $some: { plan_id: "pro" } },
				},
				paid: false,
				checkout: true,
				total: { $lte: 500 },
				next_cycle: { total: { $lt: 99 } },
				incoming: {
					$every: {
						plan_id: "pro",
						version: 2,
						paid: true,
						recurring: true,
						addon: false,
						customized: false,
						free_trial: { card_required: true, on_end: { $in: ["bill"] } },
						feature_quantities: {
							$every: { feature_id: "seats", quantity: { $lte: 10 } },
						},
					},
				},
				outgoing: { $none: { plan_id: "starter" } },
				discounts: {
					$every: {
						reward_id: { $nin: ["LAUNCH20"] },
						percent_off: { $lte: 20 },
						amount_off: { $lte: 50 },
					},
				},
				plan_schedule: "immediate",
				proration_behavior: { $in: ["prorate_immediately", "none"] },
				starts_at: { $gte: { days_from_now: -7 } },
				invoice_mode: { enabled: true },
			},
		}),
	},
	{
		name: "billing cancel: timing, plan, refund",
		rule: rules.rule({
			actions: ["billing.cancel", "billing.uncancel"],
			when: {
				customer: { plan: { $none: { plan_id: "enterprise" } } },
				cancel_action: { $in: ["cancel_end_of_cycle"] },
				outgoing: { $every: { plan_id: "starter" } },
				refund: { amount: { $lte: 50 } },
			},
		}),
	},
	{
		name: "invoices: total and refund",
		rule: rules.rule({
			actions: ["invoices.create", "invoices.credit_note"],
			when: { total: { $lte: 1000 }, refund: { amount: { $lte: 100 } } },
		}),
	},
	{
		name: "balances grant: every board field",
		rule: rules.rule({
			actions: ["balances.create"],
			when: {
				feature_id: { $in: ["ai_credits", "messages"] },
				included_grant: { $lte: 100 },
				unlimited: false,
				expires_at: { $lte: { days_from_now: 30 } },
				reset: { interval: { $in: ["month"] } },
			},
		}),
	},
	{
		name: "balances set: every board field",
		rule: rules.rule({
			actions: ["balances.update"],
			when: {
				feature_id: "ai_credits",
				add_to_balance: { $lte: 500 },
				remaining: { $lte: 1000 },
				usage: { $gte: 0 },
				included_grant: { $lte: 2000 },
			},
		}),
	},
	{
		name: "balances grant + set share feature and amount",
		rule: rules.rule({
			actions: ["balances.create", "balances.update"],
			when: { feature_id: "ai_credits", included_grant: { $lte: 100 } },
		}),
	},
	{
		name: "rewards apply: reward",
		rule: rules.rule({
			actions: ["rewards.apply"],
			when: { reward_id: "LAUNCH20" },
		}),
	},
	{
		name: "customers update/delete: customer",
		rule: rules.rule({
			actions: ["customers.update", "customers.delete"],
			when: { customer: { customer_id: "cus_1" } },
		}),
	},
	{
		name: "catalog edit plans: plan",
		rule: rules.rule({
			actions: ["catalog.edit_plans"],
			when: { plan_id: { $ne: "enterprise" } },
		}),
	},
	{
		name: "catalog edit features: feature",
		rule: rules.rule({
			actions: ["catalog.edit_features"],
			when: { feature_id: "ai_credits" },
		}),
	},
	{
		name: "who-only area with no when",
		rule: rules.whoOnly({ actions: ["api_keys.create"] }),
	},
	{
		name: "billing with no when (always)",
		rule: rules.rule({ when: null }),
	},
];

/** Builds a rule from raw JSON, so invalid shapes don't need casts. */
const invalid = (overrides: Record<string, unknown>) => ({
	...rules.rule(),
	...overrides,
});

const INVALID: { name: string; rule: unknown; path: string }[] = [
	{ name: "no subjects", rule: invalid({ subjects: [] }), path: "subjects" },
	{
		name: "API key subject (not a v1 subject)",
		rule: invalid({ subjects: [{ type: "api_key", key_id: "k" }] }),
		path: "subjects.0.type",
	},
	{
		name: "role subject without a role",
		rule: invalid({ subjects: [{ type: "role", role: "" }] }),
		path: "subjects.0.role",
	},
	{ name: "no actions", rule: invalid({ actions: [] }), path: "actions" },
	{
		name: "unknown action",
		rule: invalid({ actions: ["billing.refund"] }),
		path: "actions.0",
	},
	{
		name: "actions from two areas",
		rule: invalid({ actions: ["billing.attach", "balances.create"] }),
		path: "actions",
	},
	{
		name: "when on a who-only area",
		rule: invalid({
			actions: ["api_keys.create"],
			when: { customer: { customer_id: "x" } },
		}),
		path: "when",
	},
	{
		name: "when on customers.create mixed with update",
		rule: invalid({
			actions: ["customers.create", "customers.update"],
			when: { customer: { customer_id: "x" } },
		}),
		path: "when",
	},
	{
		name: "billing change field on a cancel rule",
		rule: invalid({ actions: ["billing.cancel"], when: { paid: false } }),
		path: "when.paid",
	},
	{
		name: "cancel field on an attach rule",
		rule: invalid({ when: { cancel_action: "cancel_immediately" } }),
		path: "when.cancel_action",
	},
	{
		name: "grant-only field on a grant + set rule",
		rule: invalid({
			actions: ["balances.create", "balances.update"],
			when: { feature_id: "ai_credits", unlimited: true },
		}),
		path: "when.unlimited",
	},
	{
		name: "unknown field nested in an embedded plan filter",
		rule: invalid({ when: { incoming: { $every: { plan_idd: "pro" } } } }),
		path: "when.incoming.$every.plan_idd",
	},
	{
		name: "unknown field inside $or",
		rule: invalid({ when: { $or: [{ paid: false }, { charges: true }] } }),
		path: "when.$or.1.charges",
	},
	{
		name: "unknown field named like an Object.prototype key",
		rule: invalid({ when: { valueOf: true } }),
		path: "when.valueOf",
	},
	{
		name: "bad enum value",
		rule: invalid({ when: { plan_schedule: "tomorrow" } }),
		path: "when.plan_schedule",
	},
];

describe("rule schema: valid rules", () => {
	test.each(VALID)("$name", ({ rule }) => {
		expect(issuePaths(rule)).toEqual([]);
	});
});

describe("rule schema: invalid rules", () => {
	test.each(INVALID)("$name → $path", ({ rule, path }) => {
		expect(issuePaths(rule)).toContain(path);
	});
});

describe("stored rule", () => {
	test("ApprovalRuleSchema adds id, version and audit fields", () => {
		const stored = {
			...rules.enterpriseTrials(),
			id: "apr_1",
			version: 3,
			updated_by: { user_id: "usr_1", name: "Ada" },
			created_at: 1,
			updated_at: 2,
		};
		expect(ApprovalRuleSchema.safeParse(stored).success).toBe(true);
		expect(
			ApprovalRuleSchema.safeParse({
				...stored,
				actions: ["billing.attach", "rewards.apply"],
			}).success,
		).toBe(false);
	});

	test("enabled defaults to true", () => {
		const { enabled: _, ...rule } = rules.rule();
		const parsed = CreateApprovalRuleParamsSchema.parse(rule);
		expect(parsed.enabled).toBe(true);
	});
});
