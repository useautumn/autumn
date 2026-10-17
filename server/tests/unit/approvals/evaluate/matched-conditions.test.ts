/**
 * S4a contract (audit §3.3): a matching filter explains itself with the
 * conditions that held, so a block can tell the member what it caught.
 *
 * Red (before):  the traversal reported the failures of allow rules.
 * Green (after): each case lists exactly the conditions that matched.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleFilter } from "@autumn/shared";
import {
	type BillingChangeFacts,
	matchRuleFilter,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const matchBlock = ({
	filter,
	change,
}: {
	filter: ApprovalRuleFilter;
	change: Partial<BillingChangeFacts>;
}) =>
	matchRuleFilter({
		rule: rules.block({ filter }),
		action: "billing.attach",
		facts: facts.billingChange(change),
		context: matchContext,
	});

const pro = facts.incomingPlan({ planId: "pro" });
const enterprise = facts.incomingPlan({ planId: "enterprise" });

describe("matched conditions", () => {
	test("a paid change plus the incoming $some element that matched", () => {
		expect(
			matchBlock({
				filter: { paid: true, incoming: { $some: { plan_id: "enterprise" } } },
				change: { paid: true, incoming: [pro, enterprise] },
			}),
		).toEqual({
			matches: true,
			conditions: [
				{ field: "paid", label: "Charges customer", limit: true, actual: true },
				{
					field: "incoming[1].plan_id",
					label: "Incoming plan",
					limit: "enterprise",
					actual: "enterprise",
				},
			],
		});
	});

	test("a bare array filter means $some", () => {
		expect(
			matchBlock({
				filter: { incoming: { plan_id: "enterprise" } },
				change: { incoming: [pro, enterprise] },
			}).conditions,
		).toEqual([
			{
				field: "incoming[1].plan_id",
				label: "Incoming plan",
				limit: "enterprise",
				actual: "enterprise",
			},
		]);
	});

	test("$every lists every element; on an empty list it still matches, visibly", () => {
		const everyPro = { incoming: { $every: { plan_id: "pro" } } };

		expect(matchBlock({ filter: everyPro, change: { incoming: [] } })).toEqual({
			matches: true,
			conditions: [
				{
					field: "incoming",
					label: "Incoming plan",
					limit: "every pro",
					actual: "none",
				},
			],
		});
		expect(
			matchBlock({ filter: everyPro, change: { incoming: [pro, pro] } })
				.conditions,
		).toEqual([
			{
				field: "incoming[0].plan_id",
				label: "Incoming plan",
				limit: "pro",
				actual: "pro",
			},
			{
				field: "incoming[1].plan_id",
				label: "Incoming plan",
				limit: "pro",
				actual: "pro",
			},
		]);
		expect(
			matchBlock({ filter: everyPro, change: { incoming: [pro, enterprise] } })
				.matches,
		).toBe(false);
	});

	test("$none reports one condition at the array", () => {
		const noEnterprise = { outgoing: { $none: { plan_id: "enterprise" } } };

		expect(
			matchBlock({
				filter: noEnterprise,
				change: { outgoing: [facts.outgoingPlan({ planId: "pro" })] },
			}),
		).toEqual({
			matches: true,
			conditions: [
				{
					field: "outgoing",
					label: "Outgoing plan",
					limit: "not enterprise",
					actual: "none match",
				},
			],
		});
		expect(
			matchBlock({
				filter: noEnterprise,
				change: { outgoing: [facts.outgoingPlan({ planId: "enterprise" })] },
			}).matches,
		).toBe(false);
	});

	test("plan field actuals report the real value on a match", () => {
		expect(
			matchBlock({
				filter: {
					incoming: {
						$some: {
							paid: true,
							recurring: true,
							addon: false,
							version: 1,
							price: { $ne: null },
							item: { $none: { feature_id: "seats" } },
						},
					},
				},
				change: { incoming: [pro] },
			}).conditions,
		).toEqual([
			{
				field: "incoming[0].paid",
				label: "Paid plan",
				limit: true,
				actual: true,
			},
			{
				field: "incoming[0].recurring",
				label: "Recurring",
				limit: true,
				actual: true,
			},
			{
				field: "incoming[0].addon",
				label: "Add-on",
				limit: false,
				actual: false,
			},
			{
				field: "incoming[0].version",
				label: "Plan version",
				limit: "1",
				actual: "1",
			},
			{
				field: "incoming[0].price",
				label: "Price",
				limit: "matching price",
				actual: "matches",
			},
			{
				field: "incoming[0].item",
				label: "Item",
				limit: "matching item",
				actual: "matches",
			},
		]);
	});

	test("$or reports the first matching branch", () => {
		const anyCharge = {
			$or: [{ total: { $gt: 1000 } }, { paid: true }, { checkout: true }],
		};

		expect(
			matchBlock({
				filter: anyCharge,
				change: { total: 10, paid: true, checkout: true },
			}).conditions,
		).toEqual([
			{ field: "paid", label: "Charges customer", limit: true, actual: true },
		]);
		expect(
			matchBlock({ filter: anyCharge, change: { total: 10 } }).matches,
		).toBe(false);
	});

	test("$and concatenates its branches' conditions", () => {
		const paidAndLarge = { $and: [{ paid: true }, { total: { $gte: 100 } }] };

		expect(
			matchBlock({ filter: paidAndLarge, change: { paid: true, total: 150 } })
				.conditions,
		).toEqual([
			{ field: "paid", label: "Charges customer", limit: true, actual: true },
			{ field: "total", label: "Due now", limit: "≥ 100", actual: "150" },
		]);
		expect(
			matchBlock({ filter: paidAndLarge, change: { paid: true, total: 50 } })
				.matches,
		).toBe(false);
	});

	test("no filter always matches with no conditions", () => {
		expect(
			matchRuleFilter({
				rule: rules.block(),
				action: "billing.attach",
				facts: facts.billingChange(),
				context: matchContext,
			}),
		).toEqual({ matches: true, conditions: [] });
	});
});
