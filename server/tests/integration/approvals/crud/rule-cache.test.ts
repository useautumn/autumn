/**
 * Rule cache (Stage 3, D2a). Enforcement reads an org's enabled rules in list order from a cache;
 * every write through the routes invalidates it, so a change applies to the next request, even
 * when a slow cache fill races the write.
 */

import { expect, test } from "bun:test";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getCachedApprovalRules,
	setCachedApprovalRules,
} from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrgApprovalRules } from "@/internal/approvals/actions/getOrgApprovalRules.js";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";

test(`${chalk.yellowBright("rule cache: create, disable, reorder and delete apply immediately")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const cachedRuleIds = async () =>
		(await getOrgApprovalRules({ ctx: ctx as unknown as AutumnContext })).map(
			(rule) => rule.id,
		);
	const cancelBlock = (name: string) =>
		rules.block({ name, actions: ["billing.cancel"] });
	const created: string[] = [];

	try {
		await cachedRuleIds();

		const { data: rule } = await api.create(cancelBlock("Cached"));
		created.push(rule.id);
		expect(await cachedRuleIds()).toContain(rule.id);

		await api.update({ id: rule.id, enabled: false });
		expect(await cachedRuleIds()).not.toContain(rule.id);
		await api.update({ id: rule.id, enabled: true });

		const order = (await api.list()).data.list.map((r) => r.id);
		const moved = [rule.id, ...order.filter((id) => id !== rule.id)];
		await api.reorder(moved);
		expect((await cachedRuleIds())[0]).toBe(rule.id);

		await api.delete(rule.id);
		expect(await cachedRuleIds()).not.toContain(rule.id);

		// A fill that read before a write must not be served after it.
		const before = await getCachedApprovalRules({ orgId: ctx.org.id });
		const { data: late } = await api.create(cancelBlock("Written mid-fill"));
		created.push(late.id);
		await setCachedApprovalRules({
			orgId: ctx.org.id,
			generation: before.generation,
			value: [],
		});
		expect(await cachedRuleIds()).toContain(late.id);
	} finally {
		await Promise.all(created.map((id) => api.delete(id)));
		await owner.cleanup();
	}
});
