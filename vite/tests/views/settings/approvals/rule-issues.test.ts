/** Contract: the editor reads a rejected save's issues from `details.issues`. */

import { describe, expect, test } from "bun:test";
import { AxiosError, type AxiosResponse } from "axios";
import {
	type ApprovalRuleIssue,
	invalidRuleIssues,
} from "@/hooks/queries/useApprovalRulesMutations";

const axiosError = (data: unknown) =>
	new AxiosError("Bad request", "400", undefined, undefined, {
		status: 400,
		data,
	} as AxiosResponse<unknown>);

const issues = [{ path: "filter.incoming", message: "Pick a plan." }];

describe("rule issues", () => {
	test.each<[string, unknown, ApprovalRuleIssue[] | null]>([
		[
			"issues under details",
			{ code: "invalid_approval_rule", details: { issues } },
			issues,
		],
		["top-level issues", { code: "invalid_approval_rule", issues }, []],
		["another error", { code: "approval_rule_editor_required" }, null],
	])("%s", (_name, data, expected) => {
		expect(invalidRuleIssues({ error: axiosError(data) })).toEqual(expected);
	});

	test("a non-HTTP error has no issues", () => {
		expect(invalidRuleIssues({ error: new Error("boom") })).toBeNull();
	});
});
