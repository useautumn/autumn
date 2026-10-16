import { expect, test } from "bun:test";
import { firstRuleDenial } from "../../../src/internal/approvals/utils/approvalRuleVerdict.js";

const deny = (overrides: Record<string, unknown> = {}) => ({
	permission: {
		verdict: "deny",
		enforced: true,
		message: "Sales can only give trials up to 2 months.",
		violations: [
			{
				field: "free_trial",
				label: "Free trial",
				limit: "2 months",
				actual: "3 months",
			},
		],
		decided_by: { level: "role", rule_id: "rule_1", rule_name: "Sales trials" },
		allowed_roles: ["admin", "billing_team"],
		...overrides,
	},
});

test("an enforced deny names the note, each limit against this request, and who can approve", () => {
	expect(firstRuleDenial({ previews: [deny()] })).toBe(
		[
			"You can't approve this. Sales can only give trials up to 2 months.",
			"• Free trial: limit 2 months, this request 3 months",
			"Who can approve it: Admin, billing_team.",
		].join("\n"),
	);
});

test("a shadow-mode deny doesn't stop the approval", () => {
	expect(
		firstRuleDenial({ previews: [deny({ enforced: false })] }),
	).toBeUndefined();
});

test("an empty allowed_roles drops the who-can line", () => {
	expect(firstRuleDenial({ previews: [deny({ allowed_roles: [] })] })).toBe(
		[
			"You can't approve this. Sales can only give trials up to 2 months.",
			"• Free trial: limit 2 months, this request 3 months",
		].join("\n"),
	);
});

test("an allow or a step without a verdict passes, and the first denied step decides", () => {
	const allow = {
		permission: {
			verdict: "allow",
			enforced: true,
			decided_by: { level: "user", rule_id: "rule_2", rule_name: "Mine" },
		},
	};
	expect(firstRuleDenial({ previews: [allow, {}] })).toBeUndefined();
	expect(
		firstRuleDenial({ previews: [allow, { _display: {}, preview: deny() }] }),
	).toContain("You can't approve this.");
});
