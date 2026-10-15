/**
 * Custom roles (Track D, D4). Routes per approvals-api-schema.md §R.
 *
 * Contract:
 * - POST /roles creates a custom role with coarse access; GET /roles lists built-ins first.
 * - Each role reports its member_count and rule_count (enabled rules naming it).
 * - A member with the custom role gets exactly that role's scopes.
 * - PATCH /roles/:name renames it, moving member.role and approval rule subjects (merging duplicates) in one transaction.
 * - DELETE /roles/:name: 409 role_in_use while members hold it, 204 once free (pending invites to it are canceled); duplicate names 409 role_exists.
 * - Built-in roles can't be edited or deleted (400 role_built_in); writes need organisation:write.
 */

import { expect, test } from "bun:test";
import {
	type ApiRole,
	AppEnv,
	BUILT_IN_ROLES,
	ErrCode,
	invitation,
	member,
	RESOURCES,
	type RoleAccessMap,
} from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { autumnAs } from "@tests/utils/testInitUtils/autumnAs.js";
import { dashboardFetch } from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import { auth } from "@/utils/auth.js";
import { generateId } from "@/utils/genUtils.js";

const supportAccess = {
	...Object.fromEntries(RESOURCES.map((resource) => [resource, "none"])),
	customers: "write",
	billing: "read",
} as RoleAccessMap;

const uniqueRoleName = () => `support_${crypto.randomUUID().slice(0, 8)}`;

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	headers: { "content-type": "application/json" },
	body: body === undefined ? undefined : JSON.stringify(body),
});

test(`${chalk.yellowBright("custom roles: create, list, assign and the scopes apply")}`, async () => {
	const name = uniqueRoleName();
	const {
		ctx,
		members: [owner, developer],
	} = await initScenario({
		setup: [s.member({ role: "owner" }), s.member({ role: "developer" })],
		actions: [],
	});

	const params = { name, label: "Support", access: supportAccess };
	const denied = await dashboardFetch(
		ctx,
		developer,
		"/roles",
		json("POST", params),
	);
	expect(denied.status).toBe(403);

	const created = await dashboardFetch<ApiRole>(
		ctx,
		owner,
		"/roles",
		json("POST", params),
	);
	expect(created.status).toBe(200);
	expect(created.data).toMatchObject({
		name,
		label: "Support",
		built_in: false,
		access: supportAccess,
		member_count: 0,
		rule_count: 0,
	});
	expect(created.data.created_at).toBeNumber();

	// Assigned through better-auth, which only accepts custom roles with dynamic access control on.
	const {
		members: [support],
	} = await initScenario({
		setup: [s.member({ role: "member" })],
		actions: [],
	});
	const supportMember = await ctx.db.query.member.findFirst({
		where: eq(member.userId, support.userId),
	});
	await auth.api.updateMemberRole({
		headers: owner.headers,
		body: { memberId: supportMember?.id ?? "", role: name },
	});

	try {
		const customerId = `custom-role-${name}`;
		await autumnAs(support).customers.create({
			id: customerId,
			name: "Support",
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientScopes,
			func: () =>
				autumnAs(support).post("/features", {
					id: `feature_${name}`,
					name: "Denied",
					type: "boolean",
				}),
		});

		const { data } = await dashboardFetch<{ list: ApiRole[] }>(
			ctx,
			owner,
			"/roles",
		);
		const builtInCount = BUILT_IN_ROLES.length;
		expect(data.list.slice(0, builtInCount).map((r) => r.name)).toEqual(
			BUILT_IN_ROLES.map((r) => r.name),
		);
		expect(data.list.find((r) => r.name === name)?.member_count).toBe(1);
	} finally {
		await support.cleanup();
		await dashboardFetch(ctx, owner, `/roles/${name}`, json("DELETE"));
		await Promise.all([owner.cleanup(), developer.cleanup()]);
	}
});

test(`${chalk.yellowBright("custom roles: rename keeps the member's access and moves rule subjects")}`, async () => {
	const name = uniqueRoleName();
	const renamed = `${name}_team`;
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	await dashboardFetch(
		ctx,
		owner,
		"/roles",
		json("POST", { name, label: "Support", access: supportAccess }),
	);

	const {
		members: [support],
	} = await initScenario({ setup: [s.member({ role: name })], actions: [] });
	const ruleId = generateId("apr");
	const live = { db: ctx.db, orgId: ctx.org.id, env: AppEnv.Live };
	await approvalRuleRepo.upsert({
		...live,
		userId: owner.userId,
		rule: {
			id: ruleId,
			name: "Support refunds",
			// Also naming the target role: the rename must merge, not duplicate, the subject.
			subjects: [
				{ subject_type: "role", subject_id: name },
				{ subject_type: "role", subject_id: renamed },
			],
			actions: ["billing.cancel"],
			when: null,
			note: null,
			enabled: true,
		},
	});

	try {
		const res = await dashboardFetch<ApiRole>(
			ctx,
			owner,
			`/roles/${name}`,
			json("PATCH", { name: renamed, label: "Support team" }),
		);
		expect(res.status).toBe(200);
		expect(res.data).toMatchObject({
			name: renamed,
			label: "Support team",
			member_count: 1,
			rule_count: 1,
		});

		const resolved = await getScopesForUserInOrg({
			db: ctx.db,
			userId: support.userId,
			organizationId: ctx.org.id,
		});
		expect(resolved).toEqual({
			role: renamed,
			scopes: ["customers:write", "billing:read"],
		});

		const rule = await approvalRuleRepo.get({ ...live, ruleId });
		expect(rule?.subjects).toEqual([
			{ subject_type: "role", subject_id: renamed },
		]);
	} finally {
		await approvalRuleRepo.delete({ ...live, ruleId });
		await support.cleanup();
		await dashboardFetch(ctx, owner, `/roles/${renamed}`, json("DELETE"));
		await owner.cleanup();
	}
});

test(`${chalk.yellowBright("custom roles: in-use, duplicate and built-in guards")}`, async () => {
	const name = uniqueRoleName();
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const params = { name, label: "Support", access: supportAccess };
	await dashboardFetch(ctx, owner, "/roles", json("POST", params));

	const {
		members: [support],
	} = await initScenario({ setup: [s.member({ role: name })], actions: [] });

	const duplicate = await dashboardFetch<{ code: string }>(
		ctx,
		owner,
		"/roles",
		json("POST", params),
	);
	expect(duplicate).toMatchObject({
		status: 409,
		data: { code: ErrCode.RoleExists },
	});

	const inUse = await dashboardFetch(
		ctx,
		owner,
		`/roles/${name}`,
		json("DELETE"),
	);
	expect(inUse).toMatchObject({
		status: 409,
		data: { code: ErrCode.RoleInUse, details: { member_count: 1 } },
	});

	const editBuiltIn = await dashboardFetch(
		ctx,
		owner,
		"/roles/admin",
		json("PATCH", { label: "Boss" }),
	);
	expect(editBuiltIn).toMatchObject({
		status: 400,
		data: { code: ErrCode.RoleBuiltIn },
	});
	const deleteBuiltIn = await dashboardFetch(
		ctx,
		owner,
		"/roles/sales",
		json("DELETE"),
	);
	expect(deleteBuiltIn).toMatchObject({
		status: 400,
		data: { code: ErrCode.RoleBuiltIn },
	});

	const inviteId = generateId("inv");
	await ctx.db.insert(invitation).values({
		id: inviteId,
		organizationId: ctx.org.id,
		email: `${name}@example.com`,
		role: name,
		expiresAt: addDays(new Date(), 7),
		inviterId: owner.userId,
	});

	await support.cleanup();
	const deleted = await dashboardFetch(
		ctx,
		owner,
		`/roles/${name}`,
		json("DELETE"),
	);
	expect(deleted.status).toBe(204);

	const { data } = await dashboardFetch<{ list: ApiRole[] }>(
		ctx,
		owner,
		"/roles",
	);
	expect(data.list.some((r) => r.name === name)).toBe(false);

	// Accepting the invite would otherwise hand out the deleted role.
	const [invite] = await ctx.db
		.select()
		.from(invitation)
		.where(eq(invitation.id, inviteId));
	expect(invite.status).toBe("canceled");
	await ctx.db.delete(invitation).where(eq(invitation.id, inviteId));
	await owner.cleanup();
});
