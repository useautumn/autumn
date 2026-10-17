/**
 * S4b contract (PRD §2 rows 4–5, §4): only matching rules count; user > role >
 * Everyone; within a level the rule later in the list wins, allow or block; no
 * match allows; disabled rules are ignored; owners and admins are subject to rules.
 *
 * Red (before):  no effect/position, the first level with any rule decided, a fallback verdict.
 * Green (after): each case resolves as listed.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleParams } from "@autumn/shared";
import { evaluateApprovalRules } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRules } from "./utils/principals.js";

const sam = principals.member({ roleId: "sales", userId: "usr_sam" });
const sales = { type: "role", role_id: "sales" } as const;
const samSubject = { type: "user", user_id: "usr_sam" } as const;

const attachPro = facts.billingChange({
	paid: true,
	incoming: [facts.incomingPlan({ planId: "pro" })],
});

const evaluate = ({
	ruleList,
	principal = sam,
}: {
	ruleList: ApprovalRuleParams[];
	principal?: ReturnType<typeof principals.member>;
}) =>
	evaluateApprovalRules({
		principal,
		action: "billing.attach",
		facts: attachPro,
		rules: storedRules(ruleList),
	});

describe("evaluateApprovalRules: which rule decides", () => {
	test("no rules, or none for this action, allows with no deciding rule", () => {
		expect(evaluate({ ruleList: [] })).toEqual({
			verdict: "allow",
			decided_by: null,
		});
		expect(
			evaluate({ ruleList: [rules.block({ actions: ["billing.cancel"] })] }),
		).toEqual({ verdict: "allow", decided_by: null });
	});

	test("a rule whose filter doesn't match is ignored, even at the user level", () => {
		const verdict = evaluate({
			ruleList: [
				rules.block({
					name: "Everyone: no paid attaches",
					filter: { paid: true },
				}),
				rules.allow({
					name: "Sam: Enterprise only",
					subjects: [samSubject],
					filter: { incoming: { $every: { plan_id: "enterprise" } } },
				}),
			],
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			decided_by: {
				level: "everyone",
				rule_name: "Everyone: no paid attaches",
			},
		});
	});

	test("a disabled matching block is ignored", () => {
		expect(evaluate({ ruleList: [rules.block({ enabled: false })] })).toEqual({
			verdict: "allow",
			decided_by: null,
		});
	});

	test("a user allow beats a role block, whatever the order", () => {
		for (const ruleList of [
			[
				rules.block({ subjects: [sales] }),
				rules.allow({ subjects: [samSubject] }),
			],
			[
				rules.allow({ subjects: [samSubject] }),
				rules.block({ subjects: [sales] }),
			],
		]) {
			expect(evaluate({ ruleList })).toMatchObject({
				verdict: "allow",
				decided_by: { level: "user" },
			});
		}
	});

	test("a role allow beats an Everyone block, whatever the order", () => {
		expect(
			evaluate({
				ruleList: [rules.allow({ subjects: [sales] }), rules.block()],
			}),
		).toMatchObject({ verdict: "allow", decided_by: { level: "role" } });
	});

	test("within a level, the rule later in the list wins, allow or block", () => {
		const allowThenBlock = evaluate({
			ruleList: [
				rules.allow({ subjects: [sales] }),
				rules.block({ subjects: [sales] }),
			],
		});
		const blockThenAllow = evaluate({
			ruleList: [
				rules.block({ subjects: [sales] }),
				rules.allow({ subjects: [sales] }),
			],
		});
		expect(allowThenBlock.verdict).toBe("deny");
		expect(blockThenAllow.verdict).toBe("allow");
	});

	test("stored position, not array order, decides within a level", () => {
		const [allow, block] = storedRules([
			rules.allow({ subjects: [sales] }),
			rules.block({ subjects: [sales] }),
		]);
		for (const ruleList of [
			[allow, block],
			[block, allow],
		]) {
			const verdict = evaluateApprovalRules({
				principal: sam,
				action: "billing.attach",
				facts: attachPro,
				rules: ruleList,
			});
			expect(verdict).toMatchObject({
				verdict: "deny",
				decided_by: { rule_id: block.id },
			});
		}
	});

	test("equal positions fall back to the id, whatever the array order", () => {
		const [allow, block] = storedRules([
			{ ...rules.allow({ subjects: [sales] }), id: "apr_b" },
			{ ...rules.block({ subjects: [sales] }), id: "apr_a" },
		]).map((rule) => ({ ...rule, position: 3 }));
		for (const ruleList of [
			[allow, block],
			[block, allow],
		]) {
			const verdict = evaluateApprovalRules({
				principal: sam,
				action: "billing.attach",
				facts: attachPro,
				rules: ruleList,
			});
			expect(verdict).toMatchObject({ decided_by: { rule_id: "apr_b" } });
		}
	});

	test("a rule naming Everyone and Sales counts at the role level for Sales", () => {
		const verdict = evaluate({
			ruleList: [rules.block({ subjects: [{ type: "everyone" }, sales] })],
		});
		expect(verdict).toMatchObject({ decided_by: { level: "role" } });
	});

	test("owners and admins are subject to rules naming them", () => {
		for (const roleId of ["owner", "admin"]) {
			const principal = principals.member({ roleId, userId: `usr_${roleId}` });
			expect(evaluate({ ruleList: [rules.block()], principal })).toMatchObject({
				verdict: "deny",
				decided_by: { level: "everyone" },
			});
			expect(
				evaluate({
					ruleList: [
						rules.block({ subjects: [{ type: "role", role_id: roleId }] }),
					],
					principal,
				}),
			).toMatchObject({ verdict: "deny", decided_by: { level: "role" } });
		}
	});

	test("conditions are ANDed within a rule", () => {
		const ruleList = [
			rules.block({ filter: { paid: true, total: { $gt: 100 } } }),
		];
		const cheap = evaluateApprovalRules({
			principal: sam,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true, total: 50 }),
			rules: storedRules(ruleList),
		});
		const dear = evaluateApprovalRules({
			principal: sam,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true, total: 500 }),
			rules: storedRules(ruleList),
		});
		expect(cheap.verdict).toBe("allow");
		expect(dear.verdict).toBe("deny");
	});
});
