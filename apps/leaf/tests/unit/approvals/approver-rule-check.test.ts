import { expect, test } from "bun:test";
import {
	firstRuleDenial,
	previewRuleDenial,
} from "../../../src/internal/approvals/utils/approvalRuleVerdict.js";

const deny = {
	verdict: "deny",
	message:
		"Sales can give trials up to 31 days that never charge the customer.",
	violations: [
		{
			field: "incoming[0].free_trial",
			label: "Free trial",
			limit: "≤ 31 days",
			actual: "45 days",
		},
		{ field: "paid", label: "Charges customer", limit: false, actual: true },
	],
	decided_by: { level: "role", rule_id: "apr_1", rule_name: "Sales trials" },
	allowed_roles: ["owner", "admin", "finance"],
};

test("an allowed or rule-free preview has no denial", () => {
	expect(previewRuleDenial({ preview: { total: 0 } })).toBeUndefined();
	expect(
		previewRuleDenial({
			preview: { total: 0, permission: { verdict: "allow", decided_by: null } },
		}),
	).toBeUndefined();
});

test("a denied preview names the rule's note, each limit vs actual, and who can approve", () => {
	expect(previewRuleDenial({ preview: { total: 0, permission: deny } })).toBe(
		[
			"You can't approve this. Sales can give trials up to 31 days that never charge the customer.",
			"• Free trial: limit ≤ 31 days, this request 45 days",
			"• Charges customer: limit No, this request Yes",
			"Who can approve it: Owner, Admin, Finance.",
		].join("\n"),
	);
});

test("one denied step denies the whole grouped card", () => {
	expect(
		firstRuleDenial({
			previews: [
				{ total: 0, permission: { verdict: "allow", decided_by: null } },
				{ total: 20, permission: deny },
			],
		}),
	).toStartWith("You can't approve this.");
	expect(
		firstRuleDenial({ previews: [{ total: 0 }, undefined] }),
	).toBeUndefined();
});
