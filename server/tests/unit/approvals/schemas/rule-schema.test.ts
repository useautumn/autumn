/**
 * S3 contract: a rule is `{ name, effect, subjects, actions, filter, note, enabled }`,
 * every PRD §8 rule is valid, and a filter only holds its area's fields.
 * The stored and API schemas never refine, and they convert to JSON Schema.
 *
 * Red (before):  no `effect`/`position`/`filter`/`role_id`, `z.custom` filter, refining stored schema.
 * Green (after): each row parses, validates or fails as listed.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApprovalRuleParams,
	ApprovalRuleSchema,
	ApprovalRuleVersionSchema,
	CreateApprovalRuleParamsSchema,
	UpdateApprovalRuleParamsSchema,
	validateApprovalRule,
} from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { z } from "zod/v4";

const issuePaths = (rule: unknown) => {
	const result = validateApprovalRule({ rule });
	return result.ok ? [] : result.issues.map((issue) => issue.path);
};

/** Builds a rule from raw JSON, so invalid shapes don't need casts. */
const raw = (overrides: Record<string, unknown>) => ({
	...rules.block(),
	...overrides,
});

const VALID: { name: string; rule: ApprovalRuleParams }[] = [
	{ name: "A1: no billing changes", rule: rules.noBillingChanges() },
	{ name: "A2: Sales Enterprise trials", rule: rules.salesEnterpriseTrials() },
	{
		name: "B: credit add-ons on the customer",
		rule: rules.creditAddonsOnCustomer(),
	},
	{ name: "C: plans on deployments", rule: rules.plansOnDeployments() },
	{ name: "D1: no Enterprise cancels", rule: rules.noEnterpriseCancels() },
	{
		name: "D2: Taylor and Kyle cancel",
		rule: rules.enterpriseCancellers({ userIds: ["usr_taylor", "usr_kyle"] }),
	},
	{ name: "E: trials for new customers", rule: rules.trialsForNewCustomers() },
	{ name: "F: Sales no custom pricing", rule: rules.salesNoCustomPricing() },
	{
		name: "grant cap for one user",
		rule: rules.grantCap({
			subjects: [{ type: "user", user_id: "usr_john" }],
			max: 50,
		}),
	},
	{
		name: "billing change: every board field",
		rule: rules.allow({
			filter: {
				customer: {
					customer_id: { $in: ["cus_1"] },
					has_paid: false,
					plan: { $some: { plan_id: "pro" } },
				},
				entity: { feature_id: "deployments" },
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
						free_trial: {
							duration: { $lte: { length: 1, unit: "month" } },
							card_required: true,
							on_end: { $in: ["bill"] },
						},
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
				billing_cycle_anchor: "now",
				starts_at: { $gte: { days_from_now: -7 } },
				invoice_mode: { enabled: true },
			},
		}),
	},
	{
		name: "incoming element: $and of two $or groups",
		rule: rules.allow({
			filter: {
				incoming: {
					$every: {
						$and: [
							{ $or: [{ plan_id: "pro", version: 2 }, { plan_id: "team" }] },
							{
								$or: [
									{ free_trial: null },
									{
										free_trial: {
											duration: { $lt: { length: 31, unit: "day" } },
										},
									},
								],
							},
						],
					},
				},
			},
		}),
	},
	{
		name: "billing cancel: timing, plan, refund, entity",
		rule: rules.block({
			actions: ["billing.cancel"],
			filter: {
				cancel_action: "cancel_immediately",
				outgoing: { $some: { plan_id: "starter" } },
				refund: { amount: { $gt: 50 } },
				entity: null,
			},
		}),
	},
	{
		name: "billing uncancel: plan and entity",
		rule: rules.block({
			actions: ["billing.uncancel"],
			filter: { outgoing: { $some: { plan_id: "starter" } }, entity: null },
		}),
	},
	{
		name: "cancel + uncancel share customer, outgoing and entity",
		rule: rules.block({
			actions: ["billing.cancel", "billing.uncancel"],
			filter: { outgoing: { $some: { plan_id: "pro" } } },
		}),
	},
	{
		name: "invoices: total and credit amount",
		rule: rules.block({
			actions: ["invoices.create", "invoices.issue_credit_note"],
			filter: { total: { $gt: 1000 }, refund: { amount: { $gt: 100 } } },
		}),
	},
	{
		name: "balances grant: every board field",
		rule: rules.block({
			actions: ["balances.create"],
			filter: {
				feature_id: { $in: ["ai_credits", "messages"] },
				included_grant: { $gt: 100 },
				unlimited: true,
				expires_at: { $gt: { days_from_now: 30 } },
				reset: { interval: { $in: ["month"] } },
			},
		}),
	},
	{
		name: "balances set: every board field",
		rule: rules.block({
			actions: ["balances.update"],
			filter: {
				feature_id: "ai_credits",
				add_to_balance: { $gt: 500 },
				remaining: { $gt: 1000 },
				usage: { $lt: 0 },
				included_grant: { $gt: 2000 },
			},
		}),
	},
	{
		name: "rewards redeem: reward",
		rule: rules.block({
			actions: ["rewards.redeem"],
			filter: { reward_id: "LAUNCH20" },
		}),
	},
	{
		name: "customers update/delete: customer",
		rule: rules.block({
			actions: ["customers.update", "customers.delete"],
			filter: { customer: { customer_id: "cus_1" } },
		}),
	},
	{
		name: "plans: plan id",
		rule: rules.block({
			actions: ["plans.update", "plans.delete"],
			filter: { plan_id: "enterprise" },
		}),
	},
	{
		name: "features: feature id",
		rule: rules.block({
			actions: ["features.delete"],
			filter: { feature_id: "ai_credits" },
		}),
	},
	{
		name: "who-only area with no filter",
		rule: rules.block({ actions: ["api_keys.create"] }),
	},
	{ name: "billing with no filter (always)", rule: rules.allow() },
	{
		name: "a rule may name Everyone and a role",
		rule: rules.block({
			subjects: [{ type: "everyone" }, { type: "role", role_id: "sales" }],
		}),
	},
];

const INVALID: { name: string; rule: unknown; path: string }[] = [
	{ name: "no effect", rule: raw({ effect: undefined }), path: "effect" },
	{ name: "unknown effect", rule: raw({ effect: "deny" }), path: "effect" },
	{ name: "no subjects", rule: raw({ subjects: [] }), path: "subjects" },
	{
		name: "API key subject",
		rule: raw({ subjects: [{ type: "api_key", key_id: "k" }] }),
		path: "subjects.0.type",
	},
	{
		name: "role subject by name",
		rule: raw({ subjects: [{ type: "role", role: "sales" }] }),
		path: "subjects.0.role_id",
	},
	{ name: "no actions", rule: raw({ actions: [] }), path: "actions" },
	{
		name: "old action id",
		rule: raw({ actions: ["billing.update_subscription"] }),
		path: "actions.0",
	},
	{
		name: "alias isn't nameable",
		rule: raw({ actions: ["billing.multi_attach"] }),
		path: "actions.0",
	},
	{
		name: "actions from two areas",
		rule: raw({ actions: ["billing.attach", "balances.create"] }),
		path: "actions",
	},
	{
		name: "plans and features are separate areas",
		rule: raw({ actions: ["plans.update", "features.update"] }),
		path: "actions",
	},
	{
		name: "filter on a who-only action",
		rule: raw({
			actions: ["api_keys.create"],
			filter: { customer: { customer_id: "x" } },
		}),
		path: "filter",
	},
	{
		name: "filter on customers.get_or_create mixed with update",
		rule: raw({
			actions: ["customers.get_or_create", "customers.update"],
			filter: { customer: { customer_id: "x" } },
		}),
		path: "filter",
	},
	{
		name: "billing change field on a cancel rule",
		rule: raw({ actions: ["billing.cancel"], filter: { paid: false } }),
		path: "filter.paid",
	},
	{
		name: "cancel field on an attach rule",
		rule: raw({ filter: { cancel_action: "cancel_immediately" } }),
		path: "filter.cancel_action",
	},
	{
		name: "refund on uncancel",
		rule: raw({ actions: ["billing.uncancel"], filter: { refund: null } }),
		path: "filter.refund",
	},
	{
		name: "cancel action on uncancel",
		rule: raw({
			actions: ["billing.uncancel"],
			filter: { cancel_action: "cancel_immediately" },
		}),
		path: "filter.cancel_action",
	},
	{
		name: "old trial length fields",
		rule: raw({
			filter: {
				incoming: { $some: { free_trial: { duration_length: { $lt: 2 } } } },
			},
		}),
		path: "filter.incoming.$some.free_trial.duration_length",
	},
	{
		name: "unknown duration unit",
		rule: raw({
			filter: {
				incoming: {
					$some: {
						free_trial: { duration: { $lt: { length: 2, unit: "week" } } },
					},
				},
			},
		}),
		path: "filter.incoming.$some",
	},
	{
		name: "unknown billing cycle anchor",
		rule: raw({ filter: { billing_cycle_anchor: "tomorrow" } }),
		path: "filter.billing_cycle_anchor",
	},
	{
		name: "grant-only field on a grant + set rule",
		rule: raw({
			actions: ["balances.create", "balances.update"],
			filter: { feature_id: "x", unlimited: true },
		}),
		path: "filter.unlimited",
	},
	{
		name: "unknown field in an embedded plan filter",
		rule: raw({ filter: { incoming: { $some: { plan_idd: "pro" } } } }),
		path: "filter.incoming.$some.plan_idd",
	},
	{
		name: "unknown field inside $or",
		rule: raw({ filter: { $or: [{ paid: false }, { charges: true }] } }),
		path: "filter.$or.1.charges",
	},
	{
		name: "unknown field named like an Object.prototype key",
		rule: raw({ filter: { valueOf: true } }),
		path: "filter.valueOf",
	},
	{
		name: "bad enum value",
		rule: raw({ filter: { plan_schedule: "tomorrow" } }),
		path: "filter.plan_schedule",
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

const storedRule = {
	...rules.salesEnterpriseTrials(),
	position: 2,
	id: "apr_1",
	version: 3,
	updated_by: { user_id: "usr_1", name: "Ada" },
	created_at: 1,
	updated_at: 2,
};

describe("stored rule", () => {
	test("ApprovalRuleSchema adds position, id, version and audit fields", () => {
		expect(ApprovalRuleSchema.parse(storedRule)).toEqual(storedRule);
		expect(
			ApprovalRuleSchema.safeParse({ ...storedRule, position: -1 }).success,
		).toBe(false);
	});

	test("never re-validates the filter against its actions", () => {
		const outOfArea = { ...storedRule, actions: ["balances.create"] };
		expect(ApprovalRuleSchema.safeParse(outOfArea).success).toBe(true);
	});

	test("reads any area's filter back without dropping keys", () => {
		const grantRule = {
			...storedRule,
			...rules.grantCap({ subjects: [{ type: "everyone" }], max: 5 }),
		};
		expect(ApprovalRuleSchema.parse(grantRule).filter).toEqual(
			grantRule.filter,
		);
	});

	test("version rows carry the rule snapshot", () => {
		const {
			id: _,
			version,
			updated_by,
			created_at,
			updated_at: __,
			...snapshot
		} = storedRule;
		const row = {
			rule_id: "apr_1",
			version,
			rule: snapshot,
			updated_by,
			created_at,
		};
		expect(ApprovalRuleVersionSchema.parse(row)).toEqual(row);
	});
});

describe("route params", () => {
	test("create defaults filter, note and enabled", () => {
		const { filter: _, note: __, enabled: ___, ...rule } = rules.block();
		expect(CreateApprovalRuleParamsSchema.parse(rule)).toMatchObject({
			filter: null,
			note: null,
			enabled: true,
		});
	});

	test("create has no position; the server appends", () => {
		expect(
			CreateApprovalRuleParamsSchema.parse({ ...rules.block(), position: 0 }),
		).not.toHaveProperty("position");
	});

	test("update takes an id and any subset of fields", () => {
		expect(
			UpdateApprovalRuleParamsSchema.parse({ id: "apr_1", enabled: false }),
		).toEqual({ id: "apr_1", enabled: false });
		expect(
			UpdateApprovalRuleParamsSchema.safeParse({ enabled: false }).success,
		).toBe(false);
	});

	test.each([
		["create params", CreateApprovalRuleParamsSchema],
		["update params", UpdateApprovalRuleParamsSchema],
		["rule", ApprovalRuleSchema],
		["rule version", ApprovalRuleVersionSchema],
	] as const)("%s convert to JSON Schema for the public API", (_, schema) => {
		expect(() =>
			z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" }),
		).not.toThrow();
	});
});
