/**
 * Rule cache (Track D, D2). Enforcement reads an org's enabled live rules from a cache;
 * every write through the routes invalidates it, so a change applies to the next request.
 */

import { expect, test } from "bun:test";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getOrgApprovalRules } from "@/internal/approvals/actions/getOrgApprovalRules.js";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";

test(`${chalk.yellowBright("rule cache: create, disable and delete apply immediately")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const cachedRuleIds = async () =>
		(await getOrgApprovalRules({ ctx })).map((rule) => rule.id);

	try {
		await cachedRuleIds(); // warm the cache

		const created = await api.create(rules.rule({ name: "Cached" }));
		const ruleId = created.data.id;
		expect(await cachedRuleIds()).toContain(ruleId);

		await api.update(ruleId, { enabled: false });
		expect(await cachedRuleIds()).not.toContain(ruleId);

		await api.update(ruleId, { enabled: true });
		expect(await cachedRuleIds()).toContain(ruleId);

		await api.delete(ruleId);
		expect(await cachedRuleIds()).not.toContain(ruleId);
	} finally {
		await owner.cleanup();
	}
});
