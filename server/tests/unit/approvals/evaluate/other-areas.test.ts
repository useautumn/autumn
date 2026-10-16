/**
 * S4a contract (audit §3.4): every area has typed facts that mirror its filter
 * shape, under the route-named action ids, and who-only actions take no facts.
 *
 * Red (before):  areas were keyed by the old `when` names and action ids.
 * Green (after): each area's block matches its own facts with readable conditions.
 */

import { describe, expect, test } from "bun:test";
import { matchRuleFilter } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { addDays } from "date-fns";
import { facts } from "./utils/facts.js";
import { MATCH_NOW, matchContext } from "./utils/matchContext.js";
import { storedRules } from "./utils/principals.js";

describe("other areas", () => {
	test("billing.cancel: timing, the cancelled plan and the refund", () => {
		expect(
			matchRuleFilter({
				rule: rules.block({
					actions: ["billing.cancel"],
					filter: {
						cancel_action: "cancel_immediately",
						outgoing: { $some: { plan_id: "enterprise" } },
						refund: { amount: { $gt: 50 } },
					},
				}),
				action: "billing.cancel",
				facts: facts.billingCancel({
					cancel_action: "cancel_immediately",
					outgoing: [facts.outgoingPlan({ planId: "enterprise" })],
					refund: { amount: 80 },
				}),
				context: matchContext,
			}).conditions,
		).toEqual([
			{
				field: "cancel_action",
				label: "Timing",
				limit: "cancel_immediately",
				actual: "cancel_immediately",
			},
			{
				field: "outgoing[0].plan_id",
				label: "Plan",
				limit: "enterprise",
				actual: "enterprise",
			},
			{ field: "refund.amount", label: "Refund", limit: "> 50", actual: "80" },
		]);
	});

	test("billing.uncancel: the restored plan on an entity", () => {
		const uncancel = ({ featureId }: { featureId: string }) =>
			matchRuleFilter({
				rule: rules.block({
					actions: ["billing.uncancel"],
					filter: {
						entity: { feature_id: "deployments" },
						outgoing: { $some: { plan_id: "pro" } },
					},
				}),
				action: "billing.uncancel",
				facts: facts.billingUncancel({
					entity: facts.entity({ featureId }),
					outgoing: [facts.outgoingPlan({ planId: "pro" })],
				}),
				context: matchContext,
			});

		expect(uncancel({ featureId: "deployments" }).conditions).toEqual([
			{
				field: "entity.feature_id",
				label: "Entity type",
				limit: "deployments",
				actual: "deployments",
			},
			{
				field: "outgoing[0].plan_id",
				label: "Plan",
				limit: "pro",
				actual: "pro",
			},
		]);
		expect(uncancel({ featureId: "seats" }).matches).toBe(false);
	});

	test("invoices: total and no refund", () => {
		expect(
			matchRuleFilter({
				rule: rules.block({
					actions: ["invoices.void"],
					filter: { total: { $gt: 500 }, refund: null },
				}),
				action: "invoices.void",
				facts: facts.invoice({ total: 900 }),
				context: matchContext,
			}).conditions,
		).toEqual([
			{ field: "total", label: "Invoice total", limit: "> 500", actual: "900" },
			{
				field: "refund",
				label: "Refund or credit amount",
				limit: "none",
				actual: "none",
			},
		]);
	});

	test("balances.create: feature, amount, reset and expiry against the given now", () => {
		const grant = ({ expiresInDays }: { expiresInDays: number }) =>
			matchRuleFilter({
				rule: rules.block({
					actions: ["balances.create"],
					filter: {
						feature_id: "ai_credits",
						included_grant: { $gt: 50 },
						reset: { interval: "month" },
						expires_at: { $lte: { days_from_now: 30 } },
					},
				}),
				action: "balances.create",
				facts: facts.balanceCreate({
					included_grant: 200,
					reset: { interval: "month" },
					expires_at: addDays(MATCH_NOW, expiresInDays).getTime(),
				}),
				context: matchContext,
			});

		expect(grant({ expiresInDays: 10 }).conditions).toEqual([
			{
				field: "feature_id",
				label: "Feature",
				limit: "ai_credits",
				actual: "ai_credits",
			},
			{
				field: "included_grant",
				label: "Amount",
				limit: "> 50",
				actual: "200",
			},
			{
				field: "reset.interval",
				label: "Reset interval",
				limit: "month",
				actual: "month",
			},
			{
				field: "expires_at",
				label: "Expires within",
				limit: "≤ 30 days from now",
				actual: "10 days from now",
			},
		]);
		expect(grant({ expiresInDays: 45 }).matches).toBe(false);
	});

	test("balances.update: add to balance", () => {
		expect(
			matchRuleFilter({
				rule: rules.block({
					actions: ["balances.update"],
					filter: { add_to_balance: { $gt: 0 } },
				}),
				action: "balances.update",
				facts: facts.balanceUpdate({ add_to_balance: 25 }),
				context: matchContext,
			}).conditions,
		).toEqual([
			{
				field: "add_to_balance",
				label: "Add to balance",
				limit: "> 0",
				actual: "25",
			},
		]);
	});

	test("rewards.redeem: the reward", () => {
		const redeem = ({ rewardId }: { rewardId: string }) =>
			matchRuleFilter({
				rule: rules.block({
					actions: ["rewards.redeem"],
					filter: { reward_id: { $in: ["vip_100", "vip_50"] } },
				}),
				action: "rewards.redeem",
				facts: facts.rewardRedeem({ reward_id: rewardId }),
				context: matchContext,
			});

		expect(redeem({ rewardId: "vip_50" }).conditions).toEqual([
			{
				field: "reward_id",
				label: "Reward",
				limit: "vip_100 or vip_50",
				actual: "vip_50",
			},
		]);
		expect(redeem({ rewardId: "summer_sale" }).matches).toBe(false);
	});

	test("customers.update: the customer id", () => {
		expect(
			matchRuleFilter({
				rule: rules.block({
					actions: ["customers.update"],
					filter: { customer: { customer_id: "cus_vip" } },
				}),
				action: "customers.update",
				facts: facts.customerChange({
					customer: facts.customer({ customerId: "cus_vip" }),
				}),
				context: matchContext,
			}).conditions,
		).toEqual([
			{
				field: "customer.customer_id",
				label: "Customer",
				limit: "cus_vip",
				actual: "cus_vip",
			},
		]);
	});

	test("plans.update and features.delete: the catalog item", () => {
		expect(
			matchRuleFilter({
				rule: rules.block({
					actions: ["plans.update"],
					filter: { plan_id: "enterprise" },
				}),
				action: "plans.update",
				facts: facts.planChange({ planId: "enterprise" }),
				context: matchContext,
			}).conditions,
		).toEqual([
			{
				field: "plan_id",
				label: "Plan",
				limit: "enterprise",
				actual: "enterprise",
			},
		]);
		expect(
			matchRuleFilter({
				rule: rules.block({
					actions: ["features.delete"],
					filter: { feature_id: { $ne: "ai_credits" } },
				}),
				action: "features.delete",
				facts: facts.featureChange({ featureId: "ai_credits" }),
				context: matchContext,
			}).matches,
		).toBe(false);
	});

	test("who-only actions take no facts and match unconditionally", () => {
		const [rule] = storedRules([rules.block({ actions: ["api_keys.create"] })]);

		expect(
			matchRuleFilter({
				rule,
				action: "api_keys.create",
				facts: null,
				context: matchContext,
			}),
		).toEqual({ matches: true, conditions: [] });
	});
});
