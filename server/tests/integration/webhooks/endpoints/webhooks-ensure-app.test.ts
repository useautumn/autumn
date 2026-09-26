/**
 * ensure(): an org with no Svix app for the env gets one on first use, stored
 * in organizations.svix_config and reused afterwards, leaving the other env's
 * id alone.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { AppEnv, apiKeys, organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { ApiKeyPrefix, createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { postWebhooks } from "./utils/webhookTestUtils.js";

const { db } = initDrizzle();
const orgId = generateId("org");
let key: string;

const storedSvixConfig = async () =>
	(
		await db.query.organizations.findFirst({
			where: eq(organizations.id, orgId),
		})
	)?.svix_config;

beforeAll(async () => {
	await db.insert(organizations).values({
		id: orgId,
		slug: `it-webhooks-ensure-${orgId}`,
		name: "Webhooks ensure test",
		logo: "",
		createdAt: new Date(),
		metadata: "",
		svix_config: { sandbox_app_id: "", live_app_id: "app_untouched" },
	});
	key = await createKey({
		db,
		env: AppEnv.Sandbox,
		name: "Webhooks ensure key",
		orgId,
		prefix: ApiKeyPrefix.Sandbox,
		meta: {},
	});
});

afterAll(async () => {
	const appId = (await storedSvixConfig())?.sandbox_app_id;
	if (appId)
		await createSvixCli()
			.application.delete(appId)
			.catch(() => {});
	await db.delete(apiKeys).where(eq(apiKeys.org_id, orgId));
	await db.delete(organizations).where(eq(organizations.id, orgId));
});

test("first call creates and stores the env's Svix app; the next call reuses it", async () => {
	const first = await postWebhooks({ route: "list", body: {}, key });
	expect(first).toEqual({ status: 200, body: { list: [] } });

	const afterFirst = await storedSvixConfig();
	expect(afterFirst?.sandbox_app_id).toMatch(/^app_/);
	expect(afterFirst?.live_app_id).toBe("app_untouched");

	const second = await postWebhooks({ route: "list", body: {}, key });
	expect(second.status).toBe(200);
	expect((await storedSvixConfig())?.sandbox_app_id).toBe(
		afterFirst?.sandbox_app_id,
	);
});
