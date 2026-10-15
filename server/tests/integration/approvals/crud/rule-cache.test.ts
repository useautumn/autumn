/**
 * Rule cache (Track D, D2). Enforcement reads an org's enabled live rules from a cache;
 * every write through the routes invalidates it, so a change applies to the next request,
 * even when a slow cache fill races the write.
 */

import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getCachedApprovalRules,
	setCachedApprovalRules,
} from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import { getOrgApprovalRules } from "@/internal/approvals/actions/getOrgApprovalRules.js";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";

test(`${chalk.yellowBright("rule cache: create, disable and delete apply immediately")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const cacheKey = { orgId: ctx.org.id, env: AppEnv.Live };
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

		// A fill that read before a write must not be served after it.
		const before = await getCachedApprovalRules({ ...cacheKey });
		const late = await api.create(rules.rule({ name: "Written mid-fill" }));
		await setCachedApprovalRules({
			...cacheKey,
			generation: before.generation,
			value: [],
		});
		expect(await cachedRuleIds()).toContain(late.data.id);
		await api.delete(late.data.id);
	} finally {
		await owner.cleanup();
	}
});
