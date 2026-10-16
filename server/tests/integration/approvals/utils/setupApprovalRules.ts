import type { CreateApprovalRuleParams } from "@autumn/shared";
import {
	autumnAs,
	type ScenarioMember,
} from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { approvalRulesApi } from "./approvalRulesApi";

/**
 * Saves `rules` for the scenario org as `owner`, and returns a client acting as
 * `member` with sandbox evaluated as live. Rules should name the member, so
 * concurrent tests on the shared org don't decide each other's requests.
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
	rules: CreateApprovalRuleParams[];
}) => {
	const api = approvalRulesApi({ ctx, session: owner });
	const ruleIds = await Promise.all(
		rules.map(async (rule) => {
			const { status, data } = await api.create(rule);
			if (status !== 200) {
				throw new Error(
					`Rule create failed (${status}): ${JSON.stringify(data)}`,
				);
			}
			return data.id;
		}),
	);

	const client = autumnAs(member);
	client.headers["x-approvals-sandbox-as-live"] = "true";

	const cleanup = async () => {
		await Promise.all(ruleIds.map((ruleId) => api.delete(ruleId)));
		await Promise.all([owner.cleanup(), member.cleanup()]);
	};

	return { client, ruleIds, cleanup };
};
