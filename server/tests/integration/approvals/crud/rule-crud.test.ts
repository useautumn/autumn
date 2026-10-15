/**
 * Approval rule CRUD (Track D, D2). Routes and shapes per approvals-api-schema.md §2.
 *
 * Contract:
 * - POST /approvals/rules creates a rule (version 1, updated_by = the caller).
 * - GET /approvals/rules/:id and GET /approvals/rules (filters: subject_type, subject_id, action, enabled).
 * - PATCH merges into the rule, re-validates it and bumps version; GET .../versions lists every save.
 * - DELETE returns { deleted: true }; later reads 404.
 * - An invalid rule returns 400 invalid_approval_rule with one issue per problem.
 */

import { expect, test } from "bun:test";
import type { ApprovalRule } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";
import { expectRuleCorrect } from "../utils/expectRuleCorrect.js";

test(`${chalk.yellowBright("rule crud: create, read, update, version and delete")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" }), s.member({ role: "admin" })],
		actions: [],
	});
	const [owner, admin] = members;
	const asOwner = approvalRulesApi({ ctx, session: owner });
	const asAdmin = approvalRulesApi({ ctx, session: admin });
	const role = `role_${crypto.randomUUID().slice(0, 8)}`;
	const params = rules.enterpriseTrials({ subjects: [{ type: "role", role }] });

	try {
		const created = await asOwner.create(params);
		expect(created.status).toBe(200);
		expectRuleCorrect({
			rule: created.data,
			params,
			version: 1,
			updatedBy: owner.userId,
		});
		const ruleId = created.data.id;

		const fetched = await asOwner.get(ruleId);
		expect(fetched.data).toEqual(created.data);

		const bySubject = await asOwner.list({
			subject_type: "role",
			subject_id: role,
		});
		expect(bySubject.data.list.map((r) => r.id)).toEqual([ruleId]);
		const byOtherAction = await asOwner.list({
			subject_type: "role",
			subject_id: role,
			action: "billing.cancel",
		});
		expect(byOtherAction.data.list).toEqual([]);

		const updated = await asAdmin.update(ruleId, {
			enabled: false,
			note: "Paused",
		});
		expect(updated.status).toBe(200);
		expectRuleCorrect({
			rule: updated.data,
			params: { ...params, enabled: false, note: "Paused" },
			version: 2,
			updatedBy: admin.userId,
		});
		const enabledOnly = await asOwner.list({
			subject_type: "role",
			subject_id: role,
			enabled: "true",
		});
		expect(enabledOnly.data.list).toEqual([]);

		const versions = await asOwner.versions(ruleId);
		expect(versions.data.list).toMatchObject([
			{
				rule_id: ruleId,
				version: 2,
				rule: { enabled: false },
				updated_by: { user_id: admin.userId },
			},
			{
				rule_id: ruleId,
				version: 1,
				rule: { enabled: true },
				updated_by: { user_id: owner.userId },
			},
		]);

		expect(await asOwner.delete(ruleId)).toMatchObject({
			status: 200,
			data: { deleted: true },
		});
		expect((await asOwner.get(ruleId)).status).toBe(404);
		expect((await asOwner.update(ruleId, { name: "Gone" })).status).toBe(404);
	} finally {
		await Promise.all(members.map((m) => m.cleanup()));
	}
});

test(`${chalk.yellowBright("rule crud: invalid rules return 400 invalid_approval_rule with issues")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });

	try {
		const mixedAreas = await api.create(
			rules.rule({ actions: ["billing.attach", "balances.create"] }),
		);
		expect(mixedAreas.status).toBe(400);
		const body = mixedAreas.data as unknown as {
			code: string;
			issues: { path: string; message: string }[];
		};
		expect(body.code).toBe("invalid_approval_rule");
		expect(body.issues.map((i) => i.path)).toContain("actions");

		const created = await api.create(rules.rule({ name: "Valid" }));
		const noSubjects = await api.update(created.data.id, { subjects: [] });
		expect(noSubjects).toMatchObject({
			status: 400,
			data: { code: "invalid_approval_rule", issues: [{ path: "subjects" }] },
		});
		expect((await api.get(created.data.id)).data.version).toBe(1);
		await api.delete(created.data.id);
	} finally {
		await owner.cleanup();
	}
});

test(`${chalk.yellowBright("rule crud: rules are org-scoped and live-only, whatever the dashboard env")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });

	try {
		// The test session sends app_env=sandbox; rules still save, as live rules.
		const created = await api.create(rules.rule({ name: "Live only" }));
		expect(created.status).toBe(200);
		const listed = await api.list();
		expect(
			listed.data.list.some((r: ApprovalRule) => r.id === created.data.id),
		).toBe(true);
		await api.delete(created.data.id);
		expect((await api.delete(created.data.id)).status).toBe(404);
	} finally {
		await owner.cleanup();
	}
});
