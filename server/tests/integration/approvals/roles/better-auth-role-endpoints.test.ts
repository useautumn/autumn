/**
 * better-auth's own role CRUD endpoints are closed (Stage 3, D4a).
 *
 * Contract: with dynamic access control on (so invites and role changes accept custom roles),
 * /organization/create-role, update-role and delete-role return 403 for everyone, including
 * owners, and leave organization_role untouched. Roles are managed only through roles.* routes,
 * which keep member.role and rule subjects in step.
 * update-member-role accepts a custom role, which is what dynamic access control is on for.
 */

import { expect, test } from "bun:test";
import { member, organizationRole } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";

const insertCustomRole = async (role: string) => {
	const id = generateId("role");
	await ctx.db.insert(organizationRole).values({
		id,
		organizationId: ctx.org.id,
		role,
		label: "Support",
		access: { customers: "write" } as never,
		permission: JSON.stringify({ ac: ["read"] }),
		createdAt: new Date(),
	});
	return id;
};

const roleRow = async (role: string) =>
	ctx.db.query.organizationRole.findFirst({
		where: and(
			eq(organizationRole.organizationId, ctx.org.id),
			eq(organizationRole.role, role),
		),
	});

// A browser sends Origin; without it better-auth's CSRF check refuses first and hides the real answer.
const post = (body: unknown): RequestInit => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		origin: process.env.CLIENT_URL ?? "http://localhost:3000",
	},
	body: JSON.stringify(body),
});

test(`${chalk.yellowBright("better-auth role endpoints: create, update and delete are refused, even for owners")}`, async () => {
	const owner = await createDashboardSession(ctx, { role: "owner" });
	const role = `support_${crypto.randomUUID().slice(0, 8)}`;
	const roleId = await insertCustomRole(role);

	try {
		const renamed = await dashboardFetch(
			ctx,
			owner,
			"/api/auth/organization/update-role",
			post({ roleName: role, data: { roleName: `${role}_renamed` } }),
		);
		expect(renamed).toMatchObject({
			status: 403,
			data: { code: "ROLES_MANAGED_BY_AUTUMN" },
		});
		expect(await roleRow(role)).toBeDefined();

		const created = await dashboardFetch(
			ctx,
			owner,
			"/api/auth/organization/create-role",
			post({ role: `${role}_new`, permission: { ac: ["read"] } }),
		);
		expect(created.status).toBe(403);
		expect(await roleRow(`${role}_new`)).toBeUndefined();

		const deleted = await dashboardFetch(
			ctx,
			owner,
			"/api/auth/organization/delete-role",
			post({ roleName: role }),
		);
		expect(deleted.status).toBe(403);
		expect(await roleRow(role)).toBeDefined();
	} finally {
		await ctx.db
			.delete(organizationRole)
			.where(eq(organizationRole.id, roleId));
		await owner.cleanup();
	}
});

test(`${chalk.yellowBright("better-auth update-member-role accepts a custom role")}`, async () => {
	const owner = await createDashboardSession(ctx, { role: "owner" });
	const target = await createDashboardSession(ctx, { role: "member" });
	const role = `support_${crypto.randomUUID().slice(0, 8)}`;
	const roleId = await insertCustomRole(role);
	const memberRow = async () =>
		ctx.db.query.member.findFirst({
			where: and(
				eq(member.organizationId, ctx.org.id),
				eq(member.userId, target.userId),
			),
		});

	try {
		const updated = await dashboardFetch(
			ctx,
			owner,
			"/api/auth/organization/update-member-role",
			post({ memberId: (await memberRow())?.id, role }),
		);
		expect(updated.status).toBe(200);
		expect((await memberRow())?.role).toBe(role);
	} finally {
		await ctx.db
			.delete(organizationRole)
			.where(eq(organizationRole.id, roleId));
		await target.cleanup();
		await owner.cleanup();
	}
});
