/**
 * S4 contract (complex case 1): "Free trial < 2 months" is stored as a day
 * branch, a month branch and a no-trial branch; `paid: false` denies any
 * request that charges the customer.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): each trial / paid combination allows or denies as listed.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	type BillingChangeFacts,
	evaluateApprovalRules,
	type FreeTrialFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const salesRep = principals.user({ role: "sales" });
const caseOne = [
	storedRule({ id: "apr_case1", rule: rules.enterpriseTrials() }),
];

const verdictFor = (billingChange: BillingChangeFacts) =>
	evaluateApprovalRules({
		principal: salesRep,
		action: "billing.update_subscription",
		facts: billingChange,
		rules: caseOne,
		env: AppEnv.Live,
	}).verdict;

const enterpriseWith = ({ freeTrial }: { freeTrial: FreeTrialFacts | null }) =>
	facts.billingChange({
		incoming: [facts.incomingPlan({ planId: "enterprise", freeTrial })],
	});

describe("evaluateApprovalRules: trials and paid", () => {
	test("free trial < 2 months handles day and month units", () => {
		expect(
			verdictFor(enterpriseWith({ freeTrial: facts.trial({ length: 45 }) })),
		).toBe("allow");
		expect(
			verdictFor(enterpriseWith({ freeTrial: facts.trial({ length: 59 }) })),
		).toBe("allow");
		expect(
			verdictFor(enterpriseWith({ freeTrial: facts.trial({ length: 60 }) })),
		).toBe("deny");
		expect(
			verdictFor(
				enterpriseWith({
					freeTrial: facts.trial({ length: 1, type: "month" }),
				}),
			),
		).toBe("allow");
		expect(
			verdictFor(
				enterpriseWith({
					freeTrial: facts.trial({ length: 2, type: "month" }),
				}),
			),
		).toBe("deny");
		expect(
			verdictFor(
				enterpriseWith({ freeTrial: facts.trial({ length: 1, type: "year" }) }),
			),
		).toBe("deny");
	});

	test("no trial passes the trial cap, but only on the named plan", () => {
		expect(verdictFor(enterpriseWith({ freeTrial: null }))).toBe("allow");
		expect(
			verdictFor(
				facts.billingChange({
					incoming: [
						facts.incomingPlan({
							planId: "pro",
							freeTrial: facts.trial({ length: 7 }),
						}),
					],
				}),
			),
		).toBe("deny");
	});

	test("a paid: false rule denies when the request charges the customer", () => {
		const shortTrial = facts.trial({
			length: 14,
			cardRequired: true,
			onEnd: "bill",
		});
		const chargesLater = facts.billingChange({
			paid: true,
			incoming: [
				facts.incomingPlan({ planId: "enterprise", freeTrial: shortTrial }),
			],
		});
		expect(verdictFor(chargesLater)).toBe("deny");

		const noCharge = facts.billingChange({
			paid: false,
			incoming: [
				facts.incomingPlan({ planId: "enterprise", freeTrial: shortTrial }),
			],
		});
		expect(verdictFor(noCharge)).toBe("allow");
	});
});
