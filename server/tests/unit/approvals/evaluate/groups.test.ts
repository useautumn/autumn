/**
 * Groups and incoming plan fields that a saved rule can still hold:
 * empty or null-only `$or` groups, grouped limits, and `custom` on incoming plans.
 *
 * Red (before):  an empty `$or` throws, null-only and grouped limits are blank,
 *                and incoming `custom` is ignored.
 * Green (after): each case denies with a readable limit and never throws.
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type ApprovalRuleWhen,
	WHEN_FIELD_LABELS,
} from "@autumn/shared";
import {
	type ApprovalVerdict,
	type BillingChangeFacts,
	evaluateApprovalRules,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const salesRep = principals.user({ role: "sales" });

const evaluate = ({
	when,
	billingFacts,
}: {
	when: ApprovalRuleWhen;
	billingFacts: BillingChangeFacts;
}): ApprovalVerdict =>
	evaluateApprovalRules({
		principal: salesRep,
		action: "billing.attach",
		facts: billingFacts,
		rules: [
			storedRule({
				id: "apr_groups",
				rule: rules.rule({
					subjects: [{ type: "role", role: "sales" }],
					when,
				}),
			}),
		],
		env: AppEnv.Live,
	});

const proAttach = facts.billingChange({
	incoming: [facts.incomingPlan({ planId: "pro" })],
	next_cycle: { total: 20 },
});

describe("evaluateApprovalRules: groups", () => {
	test("an empty $or denies instead of throwing", () => {
		const verdict = evaluate({
			when: { incoming: { $every: { $or: [] } } },
			billingFacts: proAttach,
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			violations: [{ field: "incoming[0]", limit: "no conditions" }],
		});
	});

	test("a null-only $or reports 'none' as its limit", () => {
		const verdict = evaluate({
			when: { $or: [{ next_cycle: null }] },
			billingFacts: proAttach,
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			violations: [{ field: "next_cycle", limit: "none" }],
		});
	});

	test("a grouped $some limit names each branch", () => {
		const verdict = evaluate({
			when: {
				incoming: {
					$some: { $or: [{ plan_id: "starter" }, { plan_id: "team" }] },
				},
			},
			billingFacts: proAttach,
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			violations: [{ field: "incoming", limit: "some (starter or team)" }],
		});
	});

	test("custom on an incoming plan fails closed", () => {
		const verdict = evaluate({
			when: { incoming: { $every: { custom: true } } },
			billingFacts: proAttach,
		});
		expect(verdict.verdict).toBe("deny");
	});

	test("violation labels come from WHEN_FIELD_LABELS", () => {
		const verdict = evaluate({
			when: { plan_schedule: "end_of_cycle", paid: false },
			billingFacts: facts.billingChange({
				plan_schedule: "immediate",
				paid: true,
			}),
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			violations: [
				{
					field: "plan_schedule",
					label: WHEN_FIELD_LABELS.billing_change.plan_schedule,
				},
				{ field: "paid", label: WHEN_FIELD_LABELS.billing_change.paid },
			],
		});
		expect(WHEN_FIELD_LABELS.billing_change.plan_schedule).toBe("Timing");
	});

	test("trial unit and on_end matchers read as limits", () => {
		const verdict = evaluate({
			when: {
				incoming: {
					$every: {
						free_trial: {
							duration_type: { $in: ["day", "month"] },
							on_end: { $nin: ["bill"] },
						},
					},
				},
			},
			billingFacts: facts.billingChange({
				incoming: [
					facts.incomingPlan({
						planId: "pro",
						freeTrial: facts.trial({ length: 1, type: "year", onEnd: "bill" }),
					}),
				],
			}),
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			violations: [
				{
					field: "incoming[0].free_trial",
					limit: "in day or month, on end: not bill",
				},
			],
		});
	});
});
