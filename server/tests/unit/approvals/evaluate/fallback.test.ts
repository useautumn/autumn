/**
 * S4 contract (spec "Semantics"): with no enabled rule for the action at any
 * level, the evaluator returns `fallback: "scopes"` so the caller keeps
 * today's coarse scope check.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): each case falls back, or ignores the disabled rule.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, evaluateApprovalRules } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const salesRep = principals.user({ role: "sales" });

describe("evaluateApprovalRules: fallback", () => {
	test("no rules at all → fallback to scopes", () => {
		const verdict = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true, total: 20 }),
			rules: [],
			env: AppEnv.Live,
		});
		expect(verdict).toEqual({ verdict: "fallback", fallback: "scopes" });
	});

	test("rules for another action only → fallback to scopes", () => {
		const verdict = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true, total: 20 }),
			rules: [
				storedRule({
					id: "apr_cancel",
					rule: rules.supportCancellations({
						subjects: [{ type: "role", role: "sales" }],
					}),
				}),
				storedRule({
					id: "apr_everyone_cancel",
					rule: rules.whoOnly({
						actions: ["billing.cancel"],
						subjects: [{ type: "everyone" }],
					}),
				}),
			],
			env: AppEnv.Live,
		});
		expect(verdict).toEqual({ verdict: "fallback", fallback: "scopes" });
	});

	test("a disabled rule is ignored, alone or at a more specific level", () => {
		const disabledSalesRule = storedRule({
			id: "apr_disabled",
			rule: rules.rule({
				name: "Disabled no-charge rule",
				subjects: [{ type: "role", role: "sales" }],
				when: { paid: false },
				enabled: false,
			}),
		});
		const paidAttach = facts.billingChange({ paid: true, total: 20 });

		const aloneVerdict = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: paidAttach,
			rules: [disabledSalesRule],
			env: AppEnv.Live,
		});
		expect(aloneVerdict).toEqual({ verdict: "fallback", fallback: "scopes" });

		const withEveryoneVerdict = evaluateApprovalRules({
			principal: salesRep,
			action: "billing.attach",
			facts: paidAttach,
			rules: [
				disabledSalesRule,
				storedRule({
					id: "apr_everyone",
					rule: rules.rule({ name: "Anyone can attach" }),
				}),
			],
			env: AppEnv.Live,
		});
		expect(withEveryoneVerdict).toMatchObject({
			verdict: "allow",
			decided_by: { level: "everyone", rule_id: "apr_everyone" },
		});
	});
});
