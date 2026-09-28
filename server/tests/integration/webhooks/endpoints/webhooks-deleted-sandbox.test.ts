/**
 * A deleted sandbox takes its Svix app with it:
 * - its key stops authenticating at once, not after the secret-key cache TTL;
 * - an org whose Svix app is gone gets a 404 from list, never a 500 or an empty list.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { postSandboxes, postWebhooks } from "./utils/webhookTestUtils.js";

const { db } = initDrizzle();
const masterKey = defaultCtx.orgSecretKey;
const sandboxIds: string[] = [];

const createSandbox = async (): Promise<{ id: string; key: string }> => {
	const created = await postSandboxes({
		route: "create",
		body: { name: `Webhooks-Deleted-${crypto.randomUUID()}` },
		key: masterKey,
	});
	expect(created.status).toBe(200);
	sandboxIds.push(created.body.id);
	return { id: created.body.id, key: created.body.secret_key };
};

const createHook = async ({ key }: { key: string }) => {
	const res = await postWebhooks({
		route: "create",
		body: {
			id: "it-deleted-sandbox",
			url: "https://example.com/it-deleted-sandbox",
			events: ["billing.updated"],
		},
		key,
	});
	expect(res.status).toBe(200);
};

// A test that fails before its own teardown still leaves no Svix apps behind.
afterAll(async () => {
	const svix = createSvixCli();
	for (const id of sandboxIds) {
		const org = await OrgService.get({ db, orgId: id }).catch(() => null);
		const appIds = [
			org?.svix_config?.sandbox_app_id,
			org?.svix_config?.live_app_id,
		].filter((appId): appId is string => Boolean(appId));
		await Promise.all(
			appIds.map((appId) => svix.application.delete(appId).catch(() => {})),
		);
		await db
			.delete(organizations)
			.where(eq(organizations.id, id))
			.catch(() => {});
	}
});

describe("webhooks after a sandbox's Svix app is gone", () => {
	test("a deleted sandbox's key is rejected, never a 500", async () => {
		const { id, key } = await createSandbox();
		await createHook({ key });
		expect((await postWebhooks({ route: "list", body: {}, key })).status).toBe(
			200,
		);

		const deleted = await postSandboxes({
			route: "delete",
			body: { id },
			key: masterKey,
		});
		expect(deleted.status).toBe(200);

		const listed = await postWebhooks({ route: "list", body: {}, key });
		expect(listed.status).toBe(401);
	}, 120_000);

	test("an org whose Svix app was deleted gets a 404, not an empty list", async () => {
		const { id, key } = await createSandbox();
		await createHook({ key });
		const org = await OrgService.get({ db, orgId: id }).catch(() => null);
		const appId = org?.svix_config?.sandbox_app_id;
		expect(appId).toBeTruthy();
		await createSvixCli().application.delete(appId as string);

		const listed = await postWebhooks({ route: "list", body: {}, key });
		expect(listed.status).toBe(404);
		expect(listed.body.code).toBe("org_not_found");

		const fetched = await postWebhooks({
			route: "get",
			body: { id: "it-deleted-sandbox" },
			key,
		});
		expect(fetched.status).toBe(404);
	}, 120_000);
});
