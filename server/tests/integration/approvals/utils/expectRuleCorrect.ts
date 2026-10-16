import { expect } from "bun:test";
import type { ApprovalRule, ApprovalRuleParams } from "@autumn/shared";

/** Asserts a rule from the API matches what was saved; every field but `rule` is optional. */
export const expectRuleCorrect = ({
	rule,
	params,
	version,
	updatedBy,
}: {
	rule: ApprovalRule;
	params?: Partial<ApprovalRuleParams>;
	version?: number;
	updatedBy?: string;
}) => {
	expect(rule.id).toStartWith("apr_");
	if (params) expect(rule).toMatchObject(params);
	if (version !== undefined) expect(rule.version).toBe(version);
	if (updatedBy !== undefined) {
		expect(rule.updated_by.user_id).toBe(updatedBy);
		expect(rule.updated_by.name).toBeString();
	}
	expect(rule.created_at).toBeNumber();
	expect(rule.updated_at).toBeGreaterThanOrEqual(rule.created_at);
};
