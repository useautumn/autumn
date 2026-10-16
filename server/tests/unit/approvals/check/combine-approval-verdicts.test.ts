import { describe, expect, test } from "bun:test";
import type { ApprovalVerdict } from "@autumn/shared/api/approvals/evaluate/index.js";
import { combineApprovalVerdicts } from "@/internal/approvals/evaluate/combineApprovalVerdicts";

const decidedBy = (rule_id: string) => ({
	level: "user" as const,
	rule_id,
	rule_name: rule_id,
});
const noMatch: ApprovalVerdict = { verdict: "allow", decided_by: null };
const allow: ApprovalVerdict = { verdict: "allow", decided_by: decidedBy("a") };
const deny: ApprovalVerdict = {
	verdict: "deny",
	decided_by: decidedBy("b"),
	violations: [],
	allowed_roles: [],
	message: "no",
};

describe("combineApprovalVerdicts", () => {
	test("any deny decides, even after an allow", () => {
		expect(combineApprovalVerdicts({ verdicts: [allow, deny] })).toBe(deny);
	});

	test("without a deny, the first rule-decided allow", () => {
		expect(combineApprovalVerdicts({ verdicts: [noMatch, allow] })).toBe(allow);
	});

	test("no rule matched any item is a plain allow", () => {
		expect(combineApprovalVerdicts({ verdicts: [noMatch, noMatch] })).toEqual(
			noMatch,
		);
	});
});
