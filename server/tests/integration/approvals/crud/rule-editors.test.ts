/**
 * Who can change approval rules (Stage 3, D2a).
 *
 * Contract:
 * - Owners and admins can create, update, delete and reorder rules, even when an Everyone block
 *   covers every billing action. Rules don't gate approval_rules.*, so owners can't lock themselves out.
 * - Any other role gets 403 approval_rule_editor_required, including a custom role with organisation
 *   write. Everyone with organisation read can still list, get and read versions.
 * - On /v1, a secret key with every scope can write; a narrower key can read only.
 */

import { expect, test } from "bun:test";
import { AppEnv, apiKeys, ErrCode, member, RESOURCES } from "@autumn/shared";
import type { RoleAccessMap } from "@autumn/shared/api/roles/roleAccess";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { dashboardFetch } from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { auth } from "@/utils/auth.js";
import { generateId } from "@/utils/genUtils.js";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";
import { expectApprovalRuleError } from "../utils/expectApprovalRuleError.js";

const editorRequired = {
	status: 403,
	code: ErrCode.ApprovalRuleEditorRequired,
};

const seedSecretKey = async ({
	ctx,
	scopes,
}: {
	ctx: TestContext;
	scopes: string[];
}) => {
	const key = `am_sk_test_${crypto.randomUUID().replaceAll("-", "")}`;
	const id = generateId("key");
	await ctx.db.insert(apiKeys).values({
		id,
		org_id: ctx.org.id,
		user_id: null,
		name: "rule-editors-test",
		prefix: key.substring(0, 14),
		created_at: Date.now(),
		env: ctx.env ?? AppEnv.Sandbox,
		hashed_key: hashApiKey(key),
		meta: {},
		scopes,
	});
	return { id, client: new AutumnInt({ secretKey: key }) };
};

test(`${chalk.yellowBright("rule editors: only owner and admin roles can write rules")}`, async () => {
	const roleId = `org_writer_${crypto.randomUUID().slice(0, 8)}`;
	const { ctx, members } = await initScenario({
		setup: [
			s.member({ role: "owner" }),
			s.member({ role: "admin" }),
			s.member({ role: "developer" }),
			s.member({ role: "member" }),
		],
		actions: [],
	});
	const [owner, admin, developer, writer] = members;
	const asOwner = approvalRulesApi({ ctx, session: owner });
	const created: string[] = [];

	try {
		const access = {
			...Object.fromEntries(RESOURCES.map((resource) => [resource, "none"])),
			organisation: "write",
		} as RoleAccessMap;
		await dashboardFetch(ctx, owner, "/roles.create", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ id: roleId, name: "Org writer", access }),
		});
		const writerRow = await ctx.db.query.member.findFirst({
			where: eq(member.userId, writer.userId),
		});
		await auth.api.updateMemberRole({
			headers: owner.headers,
			body: { memberId: writerRow?.id ?? "", role: roleId },
		});

		const lockdown = await asOwner.create(rules.noBillingChanges());
		created.push(lockdown.data.id);
		expect(lockdown.status).toBe(200);
		expect(
			(await asOwner.update({ id: lockdown.data.id, enabled: false })).status,
		).toBe(200);

		const asAdmin = approvalRulesApi({ ctx, session: admin });
		const byAdmin = await asAdmin.create(
			rules.block({ name: "By admin", actions: ["billing.cancel"] }),
		);
		created.push(byAdmin.data.id);
		expect(byAdmin.status).toBe(200);
		expect(
			(await asAdmin.update({ id: byAdmin.data.id, note: "Admins edit too." }))
				.status,
		).toBe(200);
		const order = (await asAdmin.list()).data.list.map((rule) => rule.id);
		expect((await asAdmin.reorder(order)).status).toBe(200);

		for (const session of [developer, writer]) {
			const api = approvalRulesApi({ ctx, session });
			expectApprovalRuleError({
				res: await api.create(rules.block({ name: "Denied" })),
				...editorRequired,
			});
			expectApprovalRuleError({
				res: await api.update({ id: byAdmin.data.id, enabled: false }),
				...editorRequired,
			});
			expectApprovalRuleError({
				res: await api.delete(byAdmin.data.id),
				...editorRequired,
			});
			expectApprovalRuleError({
				res: await api.reorder(order),
				...editorRequired,
			});
			expect((await api.get(byAdmin.data.id)).status).toBe(200);
		}
		expect(
			(
				await approvalRulesApi({ ctx, session: writer }).versions(
					byAdmin.data.id,
				)
			).status,
		).toBe(200);
		expect(
			(await approvalRulesApi({ ctx, session: developer }).list()).status,
		).toBe(200);
	} finally {
		await Promise.all(created.map((id) => asOwner.delete(id)));
		await Promise.all(members.map((m) => m.cleanup()));
		await dashboardFetch(ctx, owner, "/roles.delete", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ id: roleId }),
		});
	}
});

test(`${chalk.yellowBright("rule editors: a secret key writes with every scope, reads with fewer")}`, async () => {
	const { ctx, autumnV2_6 } = await initScenario({ setup: [], actions: [] });
	const full = await seedSecretKey({ ctx, scopes: ["admin"] });
	const narrow = await seedSecretKey({
		ctx,
		scopes: ["organisation:read", "customers:write"],
	});
	const rule = rules.block({ name: "By key", actions: ["billing.cancel"] });
	let ruleId = "";

	try {
		const created = (await full.client.post(
			"/approval_rules.create",
			rule,
		)) as { id: string; updated_by: { user_id: string } };
		ruleId = created.id;
		expect(created.updated_by.user_id).toBe(full.id);

		const listed = (await narrow.client.post("/approval_rules.list", {})) as {
			list: { id: string }[];
		};
		expect(listed.list.map((r) => r.id)).toContain(ruleId);
		await expectAutumnError({
			errCode: ErrCode.ApprovalRuleEditorRequired,
			func: () => narrow.client.post("/approval_rules.create", rule),
		});
		await expectAutumnError({
			errCode: ErrCode.ApprovalRuleEditorRequired,
			func: () => narrow.client.post("/approval_rules.delete", { id: ruleId }),
		});
	} finally {
		if (ruleId) await autumnV2_6.post("/approval_rules.delete", { id: ruleId });
		await ctx.db.delete(apiKeys).where(eq(apiKeys.id, full.id));
		await ctx.db.delete(apiKeys).where(eq(apiKeys.id, narrow.id));
	}
});
