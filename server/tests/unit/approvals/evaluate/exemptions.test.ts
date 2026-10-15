/**
 * S4 contract (spec "Semantics" + decisions 9 and 16): Owner and Admin are
 * rule-exempt, sandbox is unrestricted, and API keys keep today's scopes.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): exempt principals allow with `decided_by: null`; API keys fall back.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, evaluateApprovalRules } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

/** Denies every paid attach, for everyone, at every level. */
const noChargesForAnyone = [
	storedRule({
		id: "apr_everyone",
		rule: rules.rule({
			name: "No charges",
			subjects: [
				{ type: "everyone" },
				{ type: "role", role: "owner" },
				{ type: "role", role: "admin" },
			],
			when: { paid: false },
		}),
	}),
];

const paidAttach = facts.billingChange({ paid: true, total: 500 });

describe("evaluateApprovalRules: exemptions", () => {
	test("Owner and Admin always allow, even when a rule names them", () => {
		for (const role of ["owner", "admin"]) {
			const verdict = evaluateApprovalRules({
				principal: principals.user({ role }),
				action: "billing.attach",
				facts: paidAttach,
				rules: noChargesForAnyone,
				env: AppEnv.Live,
			});
			expect(verdict).toEqual({ verdict: "allow", decided_by: null });
		}
	});

	test("sandbox always allows", () => {
		const verdict = evaluateApprovalRules({
			principal: principals.user({ role: "sales" }),
			action: "billing.attach",
			facts: paidAttach,
			rules: noChargesForAnyone,
			env: AppEnv.Sandbox,
		});
		expect(verdict).toEqual({ verdict: "allow", decided_by: null });
	});

	test("API keys fall back to scopes in live and sandbox", () => {
		for (const env of [AppEnv.Live, AppEnv.Sandbox]) {
			const verdict = evaluateApprovalRules({
				principal: principals.apiKey(),
				action: "billing.attach",
				facts: paidAttach,
				rules: noChargesForAnyone,
				env,
			});
			expect(verdict).toEqual({ verdict: "fallback", fallback: "scopes" });
		}
	});
});
