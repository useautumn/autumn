/**
 * S4 contract (spec "Semantics"): within a level rules combine with OR; within
 * a rule every condition must hold (AND); `$or` / `$and` groups nest.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): each request allows or denies as listed.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, evaluateApprovalRules } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const salesRep = principals.user({ role: "sales" });
const supportRep = principals.user({ role: "support" });
const sales = { type: "role", role: "sales" } as const;

describe("evaluateApprovalRules: combining conditions", () => {
	test("OR across rules within a level: matching any one rule allows", () => {
		const ruleSet = [
			storedRule({
				id: "apr_free",
				rule: rules.rule({
					name: "Free changes",
					subjects: [sales],
					when: { total: { $lte: 0 } },
				}),
			}),
			storedRule({
				id: "apr_enterprise",
				rule: rules.rule({
					name: "Enterprise only",
					subjects: [sales],
					when: { incoming: { $every: { plan_id: "enterprise" } } },
				}),
			}),
		];

		const enterpriseVerdict = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: facts.billingChange({
				total: 500,
				incoming: [facts.incomingPlan({ planId: "enterprise" })],
			}),
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(enterpriseVerdict).toMatchObject({
			verdict: "allow",
			decided_by: { rule_id: "apr_enterprise" },
		});

		const proVerdict = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: facts.billingChange({
				total: 500,
				incoming: [facts.incomingPlan({ planId: "pro" })],
			}),
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(proVerdict.verdict).toBe("deny");
	});

	test("AND within a rule: one failed condition denies", () => {
		const ruleSet = [
			storedRule({
				id: "apr_small",
				rule: rules.rule({
					name: "Small one-off charges",
					subjects: [sales],
					when: { total: { $lte: 100 }, next_cycle: null },
				}),
			}),
		];

		const bothHold = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: facts.billingChange({ total: 80, next_cycle: null }),
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(bothHold.verdict).toBe("allow");

		const recurringCharge = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: facts.billingChange({ total: 80, next_cycle: { total: 80 } }),
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(recurringCharge.verdict).toBe("deny");
	});

	test("$or groups: case 3, end of cycle or immediate Starter with a small refund", () => {
		const ruleSet = [
			storedRule({ id: "apr_support", rule: rules.supportCancellations() }),
		];
		const cancel = ({
			planId,
			cancelAction,
			refund,
		}: {
			planId: string;
			cancelAction: "cancel_end_of_cycle" | "cancel_immediately";
			refund: number | null;
		}) =>
			evaluateApprovalRules({
				principal: supportRep,
				action: "billing.cancel",
				facts: facts.billingCancel({
					cancel_action: cancelAction,
					outgoing: [facts.outgoingPlan({ planId })],
					refund: refund === null ? null : { amount: refund },
				}),
				rules: ruleSet,
				env: AppEnv.Live,
			}).verdict;

		expect(
			cancel({
				planId: "pro",
				cancelAction: "cancel_end_of_cycle",
				refund: null,
			}),
		).toBe("allow");
		expect(
			cancel({
				planId: "starter",
				cancelAction: "cancel_immediately",
				refund: null,
			}),
		).toBe("allow");
		expect(
			cancel({
				planId: "starter",
				cancelAction: "cancel_immediately",
				refund: 30,
			}),
		).toBe("allow");
		expect(
			cancel({
				planId: "starter",
				cancelAction: "cancel_immediately",
				refund: 80,
			}),
		).toBe("deny");
		expect(
			cancel({
				planId: "pro",
				cancelAction: "cancel_immediately",
				refund: null,
			}),
		).toBe("deny");
	});

	test("$and groups: every branch must hold", () => {
		const ruleSet = [
			storedRule({
				id: "apr_and",
				rule: rules.rule({
					name: "Grouped",
					subjects: [sales],
					when: {
						$and: [{ total: { $lte: 100 } }, { checkout: true }],
					},
				}),
			}),
		];
		const verdictFor = ({ checkout }: { checkout: boolean }) =>
			evaluateApprovalRules({
				principal: salesRep,
				action: "billing.attach",
				facts: facts.billingChange({ total: 50, checkout }),
				rules: ruleSet,
				env: AppEnv.Live,
			}).verdict;

		expect(verdictFor({ checkout: true })).toBe("allow");
		expect(verdictFor({ checkout: false })).toBe("deny");
	});
});
