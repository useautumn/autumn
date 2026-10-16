/**
 * S4a contract (PRD §4): a stored rule never fails mid-request. Odd but
 * schema-valid filters, including operators the matchers can't evaluate, are
 * matched against realistic facts for every area without throwing.
 *
 * Red (before):  `matchRuleFilter` doesn't exist; `$regex` threw from the shared matchers.
 * Green (after): every filter in the corpus returns a result for both effects.
 */

import { describe, expect, test } from "bun:test";
import {
	APPROVAL_FILTER_SHAPES,
	type ApprovalAction,
	type ApprovalFilterKey,
	type ApprovalRuleFilter,
} from "@autumn/shared";
import {
	type ApprovalFacts,
	matchRuleFilter,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { buildFilterSchema } from "@autumn/shared/api/approvals/schemas/filters/buildFilterSchema.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const customerWithPlans = facts.customer({
	plans: [facts.outgoingPlan({ planId: "pro" })],
});

const CUSTOMER_CORPUS: ApprovalRuleFilter[] = [
	{},
	{ customer: {} },
	{ customer: { customer_id: { $regex: "^cus_" } } },
	{ customer: { customer_id: { $startsWith: "cus_" } } },
	{ customer: { plan: { $every: { plan_id: { $regex: "pro" } } } } },
	{ customer: { item: { $none: { feature_id: null } } } },
	{ customer: { $or: [{ plan: {} }, { customer_id: null }] } },
	{ $and: [{}], $or: [{}] },
	{ $or: [{ $or: [{ $and: [{}] }] }] },
];

const BILLING_CHANGE_CORPUS: ApprovalRuleFilter[] = [
	{ incoming: {} },
	{ incoming: { $some: {}, $every: {}, $none: {} } },
	{ incoming: { $some: { plan_id: { $regex: "ent" }, version: { $in: [] } } } },
	{
		incoming: {
			$every: {
				free_trial: { duration: { $gt: { length: 1, unit: "year" } } },
			},
		},
	},
	{ incoming: { $some: { free_trial: { $eq: null } } } },
	{ incoming: { $some: { free_trial: {} } } },
	{
		incoming: {
			$some: { feature_quantities: { $every: { $or: [{ quantity: null }] } } },
		},
	},
	{
		incoming: {
			$some: {
				$or: [
					{ price: null },
					{ item: { $every: { price: { billing_method: "prepaid" } } } },
				],
			},
		},
	},
	{ outgoing: { $none: { custom: true, $or: [{ addon: true }] } } },
	{ entity: {}, next_cycle: {}, invoice_mode: {} },
	{
		entity: { feature_id: { $nin: [] } },
		next_cycle: { total: { $ne: null } },
	},
	{ discounts: { $every: { percent_off: { $gt: 0 }, amount_off: null } } },
	{ total: { $eq: null }, starts_at: { $lt: { days_from_now: -1 } } },
	{
		starts_at: null,
		plan_schedule: null,
		billing_cycle_anchor: { $nin: ["now"] },
	},
];

const OTHER_CORPUS: Record<ApprovalFilterKey, ApprovalRuleFilter[]> = {
	billing_change: BILLING_CHANGE_CORPUS,
	billing_cancel: [
		{ refund: {}, outgoing: {}, entity: null },
		{ cancel_action: { $in: [] }, refund: { amount: { $lte: 0 } } },
	],
	billing_uncancel: [{ outgoing: { $every: { plan_id: { $regex: "." } } } }],
	invoice: [{ total: { $nin: [0] }, refund: { $ne: null } }],
	balance_create: [
		{ reset: {}, expires_at: {} },
		{ expires_at: null, reset: { interval: { $ne: null } }, unlimited: false },
	],
	balance_update: [{ usage: null, remaining: { $gt: 0, $lt: 0 } }],
	reward_redeem: [{ reward_id: { $startsWith: "promo" } }],
	customer_change: [],
	plan: [{ plan_id: { $regex: "." } }],
	feature: [{ feature_id: { $startsWith: "ai" } }],
};

const AREAS: Record<
	ApprovalFilterKey,
	{ action: ApprovalAction; facts: ApprovalFacts }
> = {
	billing_change: {
		action: "billing.attach",
		facts: facts.billingChange({
			customer: customerWithPlans,
			entity: facts.entity({ featureId: "deployments" }),
			incoming: [
				facts.incomingPlan({
					planId: "enterprise",
					freeTrial: facts.trial({ length: 1, unit: "month" }),
					featureQuantities: [{ feature_id: "seats", quantity: 3 }],
				}),
			],
			outgoing: [facts.outgoingPlan({ planId: "pro" })],
			discounts: [{ reward_id: "summer", percent_off: 10, amount_off: null }],
			next_cycle: { total: 100 },
			invoice_mode: { enabled: true },
		}),
	},
	billing_cancel: {
		action: "billing.cancel",
		facts: facts.billingCancel({
			customer: customerWithPlans,
			outgoing: [facts.outgoingPlan({ planId: "pro" })],
			refund: { amount: 10 },
		}),
	},
	billing_uncancel: {
		action: "billing.uncancel",
		facts: facts.billingUncancel({
			outgoing: [facts.outgoingPlan({ planId: "pro" })],
		}),
	},
	invoice: { action: "invoices.void", facts: facts.invoice() },
	balance_create: {
		action: "balances.create",
		facts: facts.balanceCreate({ reset: { interval: "month" } }),
	},
	balance_update: { action: "balances.update", facts: facts.balanceUpdate() },
	reward_redeem: { action: "rewards.redeem", facts: facts.rewardRedeem() },
	customer_change: {
		action: "customers.update",
		facts: facts.customerChange({ customer: customerWithPlans }),
	},
	plan: { action: "plans.update", facts: facts.planChange() },
	feature: { action: "features.delete", facts: facts.featureChange() },
};

const AREAS_WITH_CUSTOMER: ApprovalFilterKey[] = [
	"billing_change",
	"billing_cancel",
	"billing_uncancel",
	"invoice",
	"balance_create",
	"balance_update",
	"reward_redeem",
	"customer_change",
];

describe("matchRuleFilter never throws", () => {
	for (const filterKey of Object.keys(AREAS) as ApprovalFilterKey[]) {
		const { action, facts: areaFacts } = AREAS[filterKey];
		const corpus = [
			...(AREAS_WITH_CUSTOMER.includes(filterKey) ? CUSTOMER_CORPUS : []),
			...OTHER_CORPUS[filterKey],
		];
		const schema = buildFilterSchema({
			shape: APPROVAL_FILTER_SHAPES[filterKey],
		});

		test(`${filterKey}: ${corpus.length} odd filters, both effects`, () => {
			for (const filter of corpus) {
				expect({ filter, valid: schema.safeParse(filter).success }).toEqual({
					filter,
					valid: true,
				});
				for (const rule of [rules.block({ filter }), rules.allow({ filter })]) {
					const result = matchRuleFilter({
						rule,
						action,
						facts: areaFacts,
						context: matchContext,
					});
					expect(typeof result.matches).toBe("boolean");
				}
			}
		});
	}
});
