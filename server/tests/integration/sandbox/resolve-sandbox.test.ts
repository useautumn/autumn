import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
	AppEnv,
	getScopesForUserInOrg,
	member,
	organizations,
	user,
} from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { betterAuthMiddleware } from "@/honoMiddlewares/betterAuthMiddleware.js";
import { SANDBOX_ORG_HEADER } from "@/honoMiddlewares/sandboxAccess.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
const MAIN_ORG_ID = defaultCtx.org.id;
const FOREIGN_ORG_ID = generateId("org");
const sandboxOrgId = generateId("org");

const mockSession = (activeOrganizationId: string, scopes: string[]) => {
	const session = {
		session: { activeOrganizationId },
		user: { id: "user_resolve_test" },
		scopes,
	};
	// biome-ignore lint/suspicious/noExplicitAny: minimal session shape the middleware reads
	return spyOn(auth.api, "getSession").mockResolvedValue(session as any);
};

const runMiddleware = async (headers: Record<string, string>) => {
	const ctx = {
		db,
		env: AppEnv.Sandbox,
	} as unknown as HonoEnv["Variables"]["ctx"];
	const c = {
		get: (k: string) => (k === "ctx" ? ctx : undefined),
		set: () => {},
		req: { raw: { headers: new Headers() }, header: (n: string) => headers[n] },
	} as unknown as Context<HonoEnv>;
	let nexted = false;
	await betterAuthMiddleware(c, async () => {
		nexted = true;
	});
	return { ctx, nexted };
};

beforeAll(async () => {
	await db.insert(organizations).values({
		id: sandboxOrgId,
		slug: `resolve-test-${sandboxOrgId}|${MAIN_ORG_ID}`,
		name: "resolve-test-sandbox",
		logo: "",
		createdAt: new Date(),
		metadata: "",
		created_by: MAIN_ORG_ID,
		is_sandbox: true,
	});
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, sandboxOrgId));
});

describe("sandbox resolver end-to-end (betterAuthMiddleware)", () => {
	test("owned sandbox header resolves ctx.org to the sub-org, env forced sandbox", async () => {
		mockSession(MAIN_ORG_ID, ["owner"]);
		const { ctx, nexted } = await runMiddleware({
			[SANDBOX_ORG_HEADER]: sandboxOrgId,
		});
		expect(nexted).toBe(true);
		expect(ctx.org.id).toBe(sandboxOrgId);
		expect(ctx.env).toBe(AppEnv.Sandbox);
	});

	test("a session for a different org cannot resolve into the sandbox (leak guard)", async () => {
		mockSession(FOREIGN_ORG_ID, ["owner"]);
		await expect(
			runMiddleware({ [SANDBOX_ORG_HEADER]: sandboxOrgId }),
		).rejects.toThrow();
	});

	test("no sandbox header resolves the session's main org (legacy path unchanged)", async () => {
		mockSession(MAIN_ORG_ID, ["owner"]);
		const { ctx, nexted } = await runMiddleware({ app_env: "sandbox" });
		expect(nexted).toBe(true);
		expect(ctx.org.id).toBe(MAIN_ORG_ID);
		expect(ctx.env).toBe(AppEnv.Sandbox);
	});
});

const mockLiveSession = (userId: string) =>
	// biome-ignore lint/suspicious/noExplicitAny: getSession's overloaded endpoint type rejects a plain async impl
	(spyOn(auth.api, "getSession") as any).mockImplementation(async () => {
		const { scopes } = await getScopesForUserInOrg({
			db,
			userId,
			organizationId: MAIN_ORG_ID,
		});
		return {
			session: { activeOrganizationId: MAIN_ORG_ID },
			user: { id: userId },
			scopes,
		};
	});

const teammates = {
	developer: generateId("usr"),
	owner: generateId("usr"),
	member: generateId("usr"),
	sales: generateId("usr"),
	nonMember: generateId("usr"),
	revoke: generateId("usr"),
};

const seedUser = (id: string) =>
	db.insert(user).values({ id, name: `tm-${id}`, email: `${id}@resolve.test` });

const seedMember = (userId: string, role: string) =>
	db.insert(member).values({
		id: generateId("mem"),
		organizationId: MAIN_ORG_ID,
		userId,
		role,
		createdAt: new Date(),
	});

const removeMember = (userId: string) =>
	db
		.delete(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, MAIN_ORG_ID)),
		);

describe("transitive multi-seat access + live revocation", () => {
	beforeAll(async () => {
		for (const id of Object.values(teammates)) {
			await seedUser(id);
		}
		await seedMember(teammates.developer, "developer");
		await seedMember(teammates.owner, "owner");
		await seedMember(teammates.member, "member");
		await seedMember(teammates.sales, "sales");
		await seedMember(teammates.revoke, "developer");
	});

	afterAll(async () => {
		for (const id of Object.values(teammates)) {
			await removeMember(id);
			await db.delete(user).where(eq(user.id, id));
		}
	});

	test("a developer teammate of the master resolves the sandbox (no sandbox member row)", async () => {
		mockLiveSession(teammates.developer);
		const { ctx, nexted } = await runMiddleware({
			[SANDBOX_ORG_HEADER]: sandboxOrgId,
		});
		expect(nexted).toBe(true);
		expect(ctx.org.id).toBe(sandboxOrgId);
	});

	test("a second teammate (owner) resolves the same sandbox (multi-seat)", async () => {
		mockLiveSession(teammates.owner);
		const { ctx } = await runMiddleware({
			[SANDBOX_ORG_HEADER]: sandboxOrgId,
		});
		expect(ctx.org.id).toBe(sandboxOrgId);
	});

	test("a member teammate resolves the sandbox (read-only browse)", async () => {
		mockLiveSession(teammates.member);
		const { ctx } = await runMiddleware({
			[SANDBOX_ORG_HEADER]: sandboxOrgId,
		});
		expect(ctx.org.id).toBe(sandboxOrgId);
	});

	test("a sales teammate cannot resolve (no organisation:read)", async () => {
		mockLiveSession(teammates.sales);
		await expect(
			runMiddleware({ [SANDBOX_ORG_HEADER]: sandboxOrgId }),
		).rejects.toThrow();
	});

	test("a non-member of the master cannot resolve (empty scopes)", async () => {
		mockLiveSession(teammates.nonMember);
		await expect(
			runMiddleware({ [SANDBOX_ORG_HEADER]: sandboxOrgId }),
		).rejects.toThrow();
	});

	test("revoking access is reflected on the next request (scopes are not cached)", async () => {
		mockLiveSession(teammates.revoke);
		const { ctx } = await runMiddleware({
			[SANDBOX_ORG_HEADER]: sandboxOrgId,
		});
		expect(ctx.org.id).toBe(sandboxOrgId);

		await db
			.update(member)
			.set({ role: "sales" })
			.where(
				and(
					eq(member.userId, teammates.revoke),
					eq(member.organizationId, MAIN_ORG_ID),
				),
			);
		await expect(
			runMiddleware({ [SANDBOX_ORG_HEADER]: sandboxOrgId }),
		).rejects.toThrow();

		await removeMember(teammates.revoke);
		await expect(
			runMiddleware({ [SANDBOX_ORG_HEADER]: sandboxOrgId }),
		).rejects.toThrow();
	});
});
