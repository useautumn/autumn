/**
 * S4 contract (spec "Error messages" + api-schema §3): a deny reports the
 * failed conditions of the closest rule at the deciding level, with labels
 * and limits from field metadata, the rule's note as `message`, and the
 * roles whose rules would allow these facts.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): each deny carries the listed payload.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	type ApprovalVerdict,
	evaluateApprovalRules,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const salesRep = principals.user({ role: "sales" });
const sales = { type: "role", role: "sales" } as const;

const expectDeny = (verdict: ApprovalVerdict) => {
	if (verdict.verdict !== "deny") {
		throw new Error(`Expected deny, got ${JSON.stringify(verdict)}`);
	}
	return verdict;
};

describe("evaluateApprovalRules: violations", () => {
	test("reports only the rule with the fewest failed conditions", () => {
		const ruleSet = [
			storedRule({
				id: "apr_two_failures",
				rule: rules.rule({
					name: "Free and immediate",
					subjects: [sales],
					when: { paid: false, total: { $lte: 0 }, plan_schedule: "immediate" },
				}),
			}),
			storedRule({
				id: "apr_one_failure",
				rule: rules.rule({
					name: "Up to 100 now",
					subjects: [sales],
					when: { total: { $lte: 100 }, plan_schedule: "immediate" },
				}),
			}),
		];

		const verdict = expectDeny(
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: facts.billingChange({
					paid: true,
					total: 250,
					plan_schedule: "immediate",
				}),
				rules: ruleSet,
				env: AppEnv.Live,
			}),
		);

		expect(verdict.decided_by).toEqual({
			level: "role",
			rule_id: "apr_one_failure",
			rule_name: "Up to 100 now",
		});
		expect(verdict.violations).toEqual([
			{ field: "total", label: "Due now", limit: "≤ 100", actual: "250" },
		]);
	});

	test("labels, paths and limits come from field metadata", () => {
		const paidAndTrial = expectDeny(
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: facts.billingChange({
					paid: true,
					incoming: [
						facts.incomingPlan({
							planId: "enterprise",
							freeTrial: facts.trial({ length: 75 }),
						}),
					],
				}),
				rules: [
					storedRule({ id: "apr_case1", rule: rules.enterpriseTrials() }),
				],
				env: AppEnv.Live,
			}),
		);
		expect(paidAndTrial.violations).toEqual([
			{ field: "paid", label: "Charges customer", limit: false, actual: true },
			{
				field: "incoming[0].free_trial",
				label: "Free trial",
				limit: "< 2 months",
				actual: "75 days",
			},
		]);

		const bigDiscount = expectDeny(
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: facts.billingChange({
					incoming: [facts.incomingPlan({ planId: "pro" })],
					discounts: [
						{ reward_id: "small", percent_off: 10, amount_off: null },
						{ reward_id: "big", percent_off: 30, amount_off: null },
					],
				}),
				rules: [
					storedRule({ id: "apr_case2", rule: rules.recurringDiscounts() }),
				],
				env: AppEnv.Live,
			}),
		);
		expect(bigDiscount.violations).toEqual([
			{
				field: "discounts[1].percent_off",
				label: "Discount percent off",
				limit: "≤ 20%",
				actual: "30%",
			},
		]);

		const wrongPlan = expectDeny(
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: facts.billingChange({
					incoming: [
						facts.incomingPlan({ planId: "enterprise" }),
						facts.incomingPlan({ planId: "pro" }),
					],
				}),
				rules: [
					storedRule({ id: "apr_case1", rule: rules.enterpriseTrials() }),
				],
				env: AppEnv.Live,
			}),
		);
		expect(wrongPlan.violations).toEqual([
			{
				field: "incoming[1].plan_id",
				label: "Incoming plan",
				limit: "enterprise",
				actual: "pro",
			},
		]);
	});

	test("message is the note, or a sentence from the name and failed labels; allowed_roles lists roles whose rules pass", () => {
		const paidAttach = facts.billingChange({ paid: true, total: 300 });
		const ruleSet = [
			storedRule({
				id: "apr_sales",
				rule: rules.rule({
					name: "Sales no-charge",
					subjects: [sales],
					when: { paid: false },
					note: "Sales can't charge customers.",
				}),
			}),
			storedRule({
				id: "apr_finance",
				rule: rules.rule({
					name: "Finance charges",
					subjects: [
						{ type: "role", role: "finance" },
						{ type: "role", role: "cfo_office" },
						{ type: "user", user_id: "usr_bob" },
					],
					when: { total: { $lte: 1000 } },
				}),
			}),
			storedRule({
				id: "apr_finance_dupe",
				rule: rules.rule({
					name: "Finance anything",
					subjects: [{ type: "role", role: "finance" }],
				}),
			}),
			storedRule({
				id: "apr_support",
				rule: rules.rule({
					name: "Support small",
					subjects: [{ type: "role", role: "support" }],
					when: { total: { $lte: 10 } },
				}),
			}),
			storedRule({
				id: "apr_disabled",
				rule: rules.rule({
					name: "Disabled",
					subjects: [{ type: "role", role: "intern" }],
					enabled: false,
				}),
			}),
		];

		const withNote = expectDeny(
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: paidAttach,
				rules: ruleSet,
				env: AppEnv.Live,
			}),
		);
		expect(withNote.message).toBe("Sales can't charge customers.");
		expect(withNote.allowed_roles).toEqual([
			"owner",
			"admin",
			"finance",
			"cfo_office",
		]);

		const withoutNote = expectDeny(
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: paidAttach,
				rules: [
					storedRule({
						id: "apr_plain",
						rule: rules.rule({
							name: "Small free changes",
							subjects: [sales],
							when: { paid: false, total: { $lte: 100 } },
						}),
					}),
				],
				env: AppEnv.Live,
			}),
		);
		expect(withoutNote.message).toBe(
			'This request is outside "Small free changes": Charges customer and Due now.',
		);
		expect(withoutNote.allowed_roles).toEqual(["owner", "admin"]);
	});
});
