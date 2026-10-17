import type { ApprovalRuleParams } from "@autumn/shared";
import {
	autumnAs,
	type ScenarioMember,
} from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { approvalRulesApi } from "./approvalRulesApi";

/**
 * Saves `rules` in order as `owner` (position follows the array) and returns a
 * client acting as `member`, with sandbox judged as live. Name the member in each rule
 * so concurrent tests on the shared org can't decide each other's requests.
 */
export const setupApprovalRules = async ({
	ctx,
	owner,
	member,
	rules,
}: {
	ctx: TestContext;
	owner: ScenarioMember;
	member: ScenarioMember;
	rules: ApprovalRuleParams[];
}) => {
	const api = approvalRulesApi({ ctx, session: owner });
	const ruleIds: string[] = [];
	const cleanup = async () => {
		for (const ruleId of ruleIds) await api.delete(ruleId);
	};

	for (const rule of rules) {
		const { status, data } = await api.create(rule);
		if (status !== 200) {
			// The caller has no cleanup yet, so rules saved before this one go here.
			await cleanup();
			throw new Error(
				`Rule create failed (${status}): ${JSON.stringify(data)}`,
			);
		}
		ruleIds.push(data.id);
	}

	const client = autumnAs(member);
	client.headers["x-approvals-sandbox-as-live"] = "true";

	return { client, ruleIds, cleanup };
};
