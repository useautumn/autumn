/**
 * S4a contract (PRD §8 E): `customer.has_paid` reads the request's own
 * `has_paid` fact, passed to the shared customer matcher as `hasPaid`.
 *
 * Red (before):  customer facts are a bare FullCustomer and the matcher ignores has_paid.
 * Green (after): the block matches customers who have paid, with a readable condition.
 *
 * Needs S2b's `customerFilterMatchesFullCustomer({ hasPaid })` below this branch.
 */

import { describe, expect, test } from "bun:test";
import { matchRuleFilter } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const enterpriseTrialFor = ({ hasPaid }: { hasPaid: boolean }) =>
	facts.billingChange({
		customer: facts.customer({ hasPaid }),
		incoming: [
			facts.incomingPlan({
				planId: "enterprise",
				freeTrial: facts.trial({ length: 1, unit: "month" }),
			}),
		],
	});

describe("customer.has_paid", () => {
	test("PRD E: an Enterprise trial for a customer who has paid matches the block", () => {
		const attachTrial = ({ hasPaid }: { hasPaid: boolean }) =>
			matchRuleFilter({
				rule: rules.trialsForNewCustomers(),
				action: "billing.attach",
				facts: enterpriseTrialFor({ hasPaid }),
				context: matchContext,
			});

		expect(attachTrial({ hasPaid: true })).toEqual({
			matches: true,
			conditions: [
				{
					field: "customer.has_paid",
					label: "Customer has paid before",
					limit: "has paid before",
					actual: "has paid before",
				},
				{
					field: "incoming[0].plan_id",
					label: "Incoming plan",
					limit: "enterprise",
					actual: "enterprise",
				},
				{
					field: "incoming[0].free_trial",
					label: "Free trial",
					limit: "any",
					actual: "1 month",
				},
			],
		});
		expect(attachTrial({ hasPaid: false }).matches).toBe(false);
	});

	test("has_paid: false reads as never paid", () => {
		const { conditions } = matchRuleFilter({
			rule: rules.block({ filter: { customer: { has_paid: false } } }),
			action: "billing.attach",
			facts: enterpriseTrialFor({ hasPaid: false }),
			context: matchContext,
		});

		expect(conditions).toEqual([
			{
				field: "customer.has_paid",
				label: "Customer has paid before",
				limit: "never paid",
				actual: "never paid",
			},
		]);
	});
});
