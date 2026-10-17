/**
 * S4b contract (PRD §3 denial): a deny carries the deciding block rule's matched
 * conditions, the rule's note (or a generated message) and the roles whose own
 * allow rule would win for this request.
 *
 * Red (before):  violations were the closest allow rule's failures; owner/admin always listed.
 * Green (after): each payload is as listed.
 */

import { describe, expect, test } from "bun:test";
import { evaluateApprovalRules } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRules } from "./utils/principals.js";

const john = principals.member({ roleId: "engineering", userId: "usr_john" });
const ann = principals.member({ roleId: "engineering", userId: "usr_ann" });

const grantCaps = storedRules([
	rules.grantCap({
		subjects: [{ type: "role", role_id: "engineering" }],
		max: 500,
	}),
	{
		...rules.grantCap({
			subjects: [{ type: "user", user_id: "usr_john" }],
			max: 50,
		}),
		name: "John's cap",
	},
]);

const grant = ({
	principal,
	amount,
}: {
	principal: ReturnType<typeof principals.member>;
	amount: number;
}) =>
	evaluateApprovalRules({
		principal,
		action: "balances.create",
		facts: facts.balanceCreate({
			feature_id: "ai_credits",
			included_grant: amount,
		}),
		rules: grantCaps,
	});

describe("evaluateApprovalRules: deny details", () => {
	test("John ≤ 50, Engineering ≤ 500 (PRD §4)", () => {
		expect(grant({ principal: john, amount: 200 })).toMatchObject({
			verdict: "deny",
			decided_by: { level: "user", rule_name: "John's cap" },
			violations: [
				{ field: "feature_id", label: "Feature", actual: "ai_credits" },
				{
					field: "included_grant",
					label: "Amount",
					limit: "> 50",
					actual: "200",
				},
			],
			allowed_roles: [],
		});
		expect(grant({ principal: john, amount: 40 })).toEqual({
			verdict: "allow",
			decided_by: null,
		});
		expect(grant({ principal: ann, amount: 200 })).toEqual({
			verdict: "allow",
			decided_by: null,
		});
		expect(grant({ principal: ann, amount: 600 })).toMatchObject({
			verdict: "deny",
			decided_by: { level: "role" },
		});
	});

	test("an unconditional block has no violations and a generated message", () => {
		const verdict = evaluateApprovalRules({
			principal: ann,
			action: "billing.attach",
			facts: facts.billingChange({}),
			rules: storedRules([rules.block({ name: "No billing changes" })]),
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			violations: [],
			message: '"No billing changes" blocks this request.',
		});
	});

	test("the note wins over the generated message", () => {
		const verdict = evaluateApprovalRules({
			principal: ann,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true }),
			rules: storedRules([
				rules.block({
					name: "No charges",
					filter: { paid: true },
					note: "Ask finance.",
				}),
			]),
		});
		expect(verdict).toMatchObject({ verdict: "deny", message: "Ask finance." });
	});

	test("a blank note falls back to the generated message", () => {
		const verdict = evaluateApprovalRules({
			principal: ann,
			action: "billing.attach",
			facts: facts.billingChange({}),
			rules: storedRules([rules.block({ name: "Locked", note: "  " })]),
		});
		expect(verdict).toMatchObject({ message: '"Locked" blocks this request.' });
	});

	test("a generated message names the matched conditions", () => {
		const verdict = evaluateApprovalRules({
			principal: ann,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true, total: 500 }),
			rules: storedRules([
				rules.block({
					name: "No big charges",
					filter: { paid: true, total: { $gt: 100 } },
				}),
			]),
		});
		expect(verdict).toMatchObject({
			message:
				'"No big charges" blocks this request: Charges customer and Due now.',
		});
	});

	test("allowed_roles lists roles whose own allow would win, not every role on a rule", () => {
		const verdict = evaluateApprovalRules({
			principal: ann,
			action: "billing.attach",
			facts: facts.billingChange({ paid: true }),
			rules: storedRules([
				rules.block({ name: "No charges" }),
				rules.allow({
					name: "Finance charges",
					subjects: [{ type: "role", role_id: "finance" }],
				}),
				rules.allow({
					name: "Sales charges",
					subjects: [{ type: "role", role_id: "sales" }],
				}),
				rules.block({
					name: "Sales can't charge",
					subjects: [{ type: "role", role_id: "sales" }],
				}),
				rules.allow({
					name: "Support big only",
					subjects: [{ type: "role", role_id: "support" }],
					filter: { total: { $gt: 1000 } },
				}),
			]),
		});
		expect(verdict).toMatchObject({
			verdict: "deny",
			allowed_roles: ["finance"],
		});
	});
});
