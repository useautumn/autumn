/**
 * S4 contract (spec "Semantics"): rules are checked by level, user → role →
 * everyone. The first level with ANY enabled rule for the action decides,
 * even when it denies; lower levels aren't checked.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): each level decides as described per test.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, type ApprovalRule, type RuleSubject } from "@autumn/shared";
import { evaluateApprovalRules } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const john = principals.user({ role: "sales", userId: "usr_john" });
const otherSalesRep = principals.user({ role: "sales", userId: "usr_jane" });

/** "Free trials shorter than `maxDays` days" (no trial is fine too). */
const trialCap = ({
	id,
	maxDays,
	subjects,
}: {
	id: string;
	maxDays: number;
	subjects: RuleSubject[];
}): ApprovalRule =>
	storedRule({
		id,
		rule: rules.rule({
			name: `Trials under ${maxDays} days`,
			subjects,
			when: {
				incoming: {
					$every: {
						$or: [
							{ free_trial: null },
							{
								free_trial: {
									duration_type: "day",
									duration_length: { $lt: maxDays },
								},
							},
						],
					},
				},
			},
		}),
	});

const attachWithTrial = ({ days }: { days: number }) =>
	facts.billingChange({
		incoming: [
			facts.incomingPlan({
				planId: "pro",
				freeTrial: facts.trial({ length: days }),
			}),
		],
	});

describe("evaluateApprovalRules: levels", () => {
	test("widening: a user rule beats a stricter role rule", () => {
		const ruleSet = [
			trialCap({
				id: "apr_sales",
				maxDays: 31,
				subjects: [{ type: "role", role: "sales" }],
			}),
			trialCap({
				id: "apr_john",
				maxDays: 60,
				subjects: [{ type: "user", user_id: "usr_john" }],
			}),
		];
		const attach45 = attachWithTrial({ days: 45 });

		const johnVerdict = evaluateApprovalRules({
			principal: john,
			action: "billing.attach",
			facts: attach45,
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(johnVerdict).toEqual({
			verdict: "allow",
			decided_by: {
				level: "user",
				rule_id: "apr_john",
				rule_name: "Trials under 60 days",
			},
		});

		const janeVerdict = evaluateApprovalRules({
			principal: otherSalesRep,
			action: "billing.attach",
			facts: attach45,
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(janeVerdict.verdict).toBe("deny");
		if (janeVerdict.verdict !== "deny") return;
		expect(janeVerdict.decided_by).toEqual({
			level: "role",
			rule_id: "apr_sales",
			rule_name: "Trials under 31 days",
		});
	});

	test("narrowing: the user level decides even when it denies and the role would allow", () => {
		const ruleSet = [
			trialCap({
				id: "apr_sales",
				maxDays: 60,
				subjects: [{ type: "role", role: "sales" }],
			}),
			trialCap({
				id: "apr_new_hire",
				maxDays: 7,
				subjects: [{ type: "user", user_id: "usr_john" }],
			}),
		];
		const attach14 = attachWithTrial({ days: 14 });

		const johnVerdict = evaluateApprovalRules({
			principal: john,
			action: "billing.attach",
			facts: attach14,
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(johnVerdict.verdict).toBe("deny");
		if (johnVerdict.verdict !== "deny") return;
		expect(johnVerdict.decided_by.level).toBe("user");
		expect(johnVerdict.decided_by.rule_id).toBe("apr_new_hire");

		const janeVerdict = evaluateApprovalRules({
			principal: otherSalesRep,
			action: "billing.attach",
			facts: attach14,
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(janeVerdict).toMatchObject({
			verdict: "allow",
			decided_by: { level: "role", rule_id: "apr_sales" },
		});
	});

	test("a role rule beats Everyone, and a rule grants a role on its own", () => {
		const ruleSet = [
			storedRule({
				id: "apr_everyone",
				rule: rules.rule({
					name: "No charges",
					subjects: [{ type: "everyone" }],
					when: { paid: false },
				}),
			}),
			storedRule({
				id: "apr_sales",
				rule: rules.rule({
					name: "Small charges",
					subjects: [{ type: "role", role: "sales" }],
					when: { total: { $lte: 100 } },
				}),
			}),
		];
		const paidAttach = facts.billingChange({ paid: true, total: 50 });

		const salesVerdict = evaluateApprovalRules({
			principal: john,
			action: "billing.attach",
			facts: paidAttach,
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(salesVerdict).toMatchObject({
			verdict: "allow",
			decided_by: { level: "role", rule_id: "apr_sales" },
		});

		// A Member has no billing:write; the Everyone rule alone decides for them.
		const member = principals.user({ role: "member" });
		const memberPaid = evaluateApprovalRules({
			principal: member,
			action: "billing.attach",
			facts: paidAttach,
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(memberPaid).toMatchObject({
			verdict: "deny",
			decided_by: { level: "everyone", rule_id: "apr_everyone" },
		});

		const memberFree = evaluateApprovalRules({
			principal: member,
			action: "billing.attach",
			facts: facts.billingChange(),
			rules: ruleSet,
			env: AppEnv.Live,
		});
		expect(memberFree).toMatchObject({
			verdict: "allow",
			decided_by: { level: "everyone", rule_id: "apr_everyone" },
		});
	});
});
