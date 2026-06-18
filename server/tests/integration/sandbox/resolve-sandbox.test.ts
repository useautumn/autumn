import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { AppEnv, organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
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
