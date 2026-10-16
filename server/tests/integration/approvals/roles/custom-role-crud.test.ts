/**
 * Custom roles (Stage 3, D4). RPC routes per the PRD: POST /roles.<verb>, id in the body.
 *
 * Contract:
 * - roles.list returns built-ins first as { id, name }, then custom roles by name, each with
 *   member_count and rule_count (enabled rules naming it).
 * - roles.create makes a custom role with coarse access; a member with it gets exactly those scopes.
 * - roles.update changes the name and access only; the id is fixed, so members keep their access.
 * - roles.delete: 404 role_not_found, 400 role_built_in, 409 role_in_use (details.member_count)
 *   while members hold it; otherwise 200 { id }, cancelling pending invites and removing the rule
 *   subjects naming it (a rule left naming no one is disabled), so a re-created id inherits nothing.
 * - roles.list is also on the public API (/v1) for agents; writes need organisation:write and
 *   stay dashboard-only. A bad body is a 400, not a 500.
 */

import { expect, test } from "bun:test";
import { ErrCode, invitation, member, RESOURCES } from "@autumn/shared";
import type { ApiRole } from "@autumn/shared/api/roles/apiRole";
import type { RoleAccessMap } from "@autumn/shared/api/roles/roleAccess";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import { BUILT_IN_ROLES } from "@autumn/shared/utils/roleUtils/builtInRoles";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { autumnAs } from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import {
	type DashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
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

const uniqueRoleId = () => `support_${crypto.randomUUID().slice(0, 8)}`;

const rolesApi = ({
	ctx,
	session,
}: {
	ctx: TestContext;
	session: DashboardSession;
}) => {
	const call = <T>(verb: string, body: unknown) =>
		dashboardFetch<T>(ctx, session, `/roles.${verb}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	return {
		list: () => call<{ list: ApiRole[] }>("list", {}),
		create: (body: unknown) => call<ApiRole>("create", body),
		update: (body: unknown) => call<ApiRole>("update", body),
		delete: (id: string) =>
			call<{ id: string; code?: string }>("delete", { id }),
	};
};

/** Assigns a custom role through better-auth, which accepts it only with dynamic access control on. */
const assignRole = async ({
	ctx,
	owner,
	userId,
	roleId,
}: {
	ctx: TestContext;
	owner: DashboardSession;
	userId: string;
	roleId: string;
}) => {
	const row = await ctx.db.query.member.findFirst({
		where: eq(member.userId, userId),
	});
	await auth.api.updateMemberRole({
		headers: owner.headers,
		body: { memberId: row?.id ?? "", role: roleId },
	});
};

const insertRoleRule = ({
	ctx,
	ownerId,
	roleIds,
}: {
	ctx: TestContext;
	ownerId: string;
	roleIds: string[];
}) =>
	approvalRuleRepo.insert({
		db: ctx.db,
		orgId: ctx.org.id,
		userId: ownerId,
		rule: {
			id: generateId("apr"),
			name: "Role rule",
			effect: "block",
			subjects: roleIds.map((id) => ({
				subject_type: "role" as const,
				subject_id: id,
			})),
			actions: ["billing.cancel"],
			filter: null,
			note: null,
			enabled: true,
		},
	});

test(`${chalk.yellowBright("roles.create then roles.list: built-ins first as { id, name }, then the custom role")}`, async () => {
	const id = uniqueRoleId();
	const { ctx, members, autumnV2_6 } = await initScenario({
		setup: [
			s.member({ role: "owner" }),
			s.member({ role: "developer" }),
			s.member({ role: "member" }),
		],
		actions: [],
	});
	const [owner, developer, support] = members;
	const params = { id, name: "Support", access: supportAccess };

	try {
		expect(
			(await rolesApi({ ctx, session: developer }).create(params)).status,
		).toBe(403);

		const api = rolesApi({ ctx, session: owner });
		const created = await api.create(params);
		expect(created).toMatchObject({
			status: 200,
			data: {
				id,
				name: "Support",
				built_in: false,
				access: supportAccess,
				member_count: 0,
				rule_count: 0,
			},
		});

		await assignRole({ ctx, owner, userId: support.userId, roleId: id });
		await autumnAs(support).customers.create({
			id: `custom-role-${id}`,
			name: "Support",
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientScopes,
			func: () =>
				autumnAs(support).post("/features", {
					id: `feature_${id}`,
					name: "Denied",
					type: "boolean",
				}),
		});

		const { data } = await api.list();
		expect(
			data.list.slice(0, BUILT_IN_ROLES.length).map((r) => [r.id, r.name]),
		).toEqual(BUILT_IN_ROLES.map((r) => [r.id, r.name]));
		expect(data.list.find((r) => r.id === id)?.member_count).toBe(1);

		// Agents read role ids for rule subjects through the public API.
		const publicList = (await autumnV2_6.post("/roles.list", {})) as {
			list: ApiRole[];
		};
		expect(publicList.list.map((r) => r.id)).toContain(id);
	} finally {
		await Promise.all(members.map((m) => m.cleanup()));
		await rolesApi({ ctx, session: owner }).delete(id);
	}
});

test(`${chalk.yellowBright("roles.update changes the name and access; the id and its members stay")}`, async () => {
	const id = uniqueRoleId();
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" }), s.member({ role: "member" })],
		actions: [],
	});
	const [owner, support] = members;
	const api = rolesApi({ ctx, session: owner });
	await api.create({ id, name: "Support", access: supportAccess });
	await assignRole({ ctx, owner, userId: support.userId, roleId: id });
	const rule = await insertRoleRule({
		ctx,
		ownerId: owner.userId,
		roleIds: [id],
	});

	try {
		const updated = await api.update({
			id,
			name: "Support team",
			access: { ...supportAccess, billing: "write" },
		});
		expect(updated).toMatchObject({
			status: 200,
			data: { id, name: "Support team", member_count: 1, rule_count: 1 },
		});
		expect(updated.data.access.billing).toBe("write");

		const resolved = await getScopesForUserInOrg({
			db: ctx.db,
			userId: support.userId,
			organizationId: ctx.org.id,
		});
		expect(resolved).toEqual({
			role: id,
			scopes: ["customers:write", "billing:write"],
		});
	} finally {
		await approvalRuleRepo.delete({
			db: ctx.db,
			orgId: ctx.org.id,
			ruleId: rule.id,
		});
		await Promise.all(members.map((m) => m.cleanup()));
		await api.delete(id);
	}
});

test(`${chalk.yellowBright("roles.delete guards: not found, built-in, in use, duplicate id, bad body")}`, async () => {
	const id = uniqueRoleId();
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" }), s.member({ role: "member" })],
		actions: [],
	});
	const [owner, support] = members;
	const api = rolesApi({ ctx, session: owner });
	const params = { id, name: "Support", access: supportAccess };
	await api.create(params);
	await assignRole({ ctx, owner, userId: support.userId, roleId: id });

	try {
		expect(await api.create(params)).toMatchObject({
			status: 409,
			data: { code: ErrCode.RoleExists },
		});
		expect(await api.delete(`${id}_ghost`)).toMatchObject({
			status: 404,
			data: { code: ErrCode.RoleNotFound },
		});
		expect(await api.update({ id: "admin", name: "Boss" })).toMatchObject({
			status: 400,
			data: { code: ErrCode.RoleBuiltIn },
		});
		expect(await api.delete("sales")).toMatchObject({
			status: 400,
			data: { code: ErrCode.RoleBuiltIn },
		});
		expect(await api.delete(id)).toMatchObject({
			status: 409,
			data: { code: ErrCode.RoleInUse, details: { member_count: 1 } },
		});
		expect(
			(await api.create({ id: "Bad Id!", name: "Bad", access: supportAccess }))
				.status,
		).toBe(400);
	} finally {
		await Promise.all(members.map((m) => m.cleanup()));
		await api.delete(id);
	}
});

test(`${chalk.yellowBright("roles.delete cancels invites and removes the rule subjects naming the role")}`, async () => {
	const id = uniqueRoleId();
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = rolesApi({ ctx, session: owner });
	await api.create({ id, name: "Support", access: supportAccess });
	const shared = await insertRoleRule({
		ctx,
		ownerId: owner.userId,
		roleIds: [id, "sales"],
	});
	const only = await insertRoleRule({
		ctx,
		ownerId: owner.userId,
		roleIds: [id],
	});
	const inviteId = generateId("inv");
	await ctx.db.insert(invitation).values({
		id: inviteId,
		organizationId: ctx.org.id,
		email: `${id}@example.com`,
		role: id,
		expiresAt: addDays(new Date(), 7),
		inviterId: owner.userId,
	});
	const ruleOf = (ruleId: string) =>
		approvalRuleRepo.get({ db: ctx.db, orgId: ctx.org.id, ruleId });

	try {
		expect(await api.delete(id)).toMatchObject({ status: 200, data: { id } });

		expect((await ruleOf(shared.id))?.subjects).toEqual([
			{ subject_type: "role", subject_id: "sales" },
		]);
		expect(await ruleOf(only.id)).toMatchObject({
			enabled: false,
			subjects: [],
		});
		const [invite] = await ctx.db
			.select()
			.from(invitation)
			.where(eq(invitation.id, inviteId));
		expect(invite.status).toBe("canceled");

		const recreated = await api.create({
			id,
			name: "Support again",
			access: supportAccess,
		});
		expect(recreated.data.rule_count).toBe(0);
	} finally {
		for (const rule of [shared, only]) {
			await approvalRuleRepo.delete({
				db: ctx.db,
				orgId: ctx.org.id,
				ruleId: rule.id,
			});
		}
		await ctx.db.delete(invitation).where(eq(invitation.id, inviteId));
		await api.delete(id);
		await owner.cleanup();
	}
});
