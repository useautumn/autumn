import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppEnv, AuthType, type Organization } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { User } from "better-auth";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { SANDBOX_ORG_HEADER } from "@/honoMiddlewares/sandboxAccess.js";
import { secretKeyMiddleware } from "@/honoMiddlewares/secretKeyMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";

const { db } = initDrizzle();
const MASTER_ORG_ID = defaultCtx.org.id;
const masterKey = defaultCtx.orgSecretKey;
let sandbox: Organization | undefined;
let sandboxId = "";
let sandboxKey = "";

const runApiKey = async ({
	key,
	headers = {},
}: {
	key: string;
	headers?: Record<string, string>;
}) => {
	const ctx = {
		db,
		env: AppEnv.Sandbox,
	} as unknown as HonoEnv["Variables"]["ctx"];
	const headerMap: Record<string, string> = {
		authorization: `Bearer ${key}`,
		...headers,
	};
	const c = {
		get: (k: string) => (k === "ctx" ? ctx : undefined),
		set: () => {},
		req: {
			raw: { headers: new Headers(headerMap) },
			header: (n: string) => headerMap[n.toLowerCase()],
		},
	} as unknown as Context<HonoEnv>;
	let nexted = false;
	await secretKeyMiddleware(c, async () => {
		nexted = true;
	});
	return { ctx, nexted };
};

beforeAll(async () => {
	const actorUser = (await db.query.user.findFirst()) as unknown as User;
	const created = await createSandboxForOrg({
		db,
		masterOrg: defaultCtx.org,
		actorUser,
		name: "API Isolation Sandbox",
	});
	sandbox = created.org;
	sandboxId = created.org.id;
	sandboxKey = created.secret_key;
}, 120_000);

afterAll(async () => {
	if (sandbox) {
		await deletePlatformSubOrg({
			db,
			org: sandbox,
			logger,
			skipLiveCustomerCheck: true,
		});
	}
});

describe("API-key sandbox isolation (the key, not any header, picks the org)", () => {
	test("a sandbox's secret key resolves ctx.org to that sandbox", async () => {
		const { ctx, nexted } = await runApiKey({ key: sandboxKey });
		expect(nexted).toBe(true);
		expect(ctx.org.id).toBe(sandboxId);
		expect(ctx.env).toBe(AppEnv.Sandbox);
		expect(ctx.authType).toBe(AuthType.SecretKey);
	});

	test("the master's secret key resolves ctx.org to the master, never a sandbox", async () => {
		const { ctx } = await runApiKey({ key: masterKey });
		expect(ctx.org.id).toBe(MASTER_ORG_ID);
	});

	test("a master key + x-sandbox-org-id header does NOT reach the sandbox (no header-hop)", async () => {
		const { ctx } = await runApiKey({
			key: masterKey,
			headers: { [SANDBOX_ORG_HEADER]: sandboxId },
		});
		expect(ctx.org.id).toBe(MASTER_ORG_ID);
	});

	test("a sandbox key + a foreign x-sandbox-org-id header still resolves to its own sandbox", async () => {
		const { ctx } = await runApiKey({
			key: sandboxKey,
			headers: { [SANDBOX_ORG_HEADER]: MASTER_ORG_ID },
		});
		expect(ctx.org.id).toBe(sandboxId);
	});
});
