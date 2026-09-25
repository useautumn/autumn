/**
 * Vercel events are published to the org's Vercel Svix app, so a webhook whose
 * events are all `vercel.*` lives there:
 * - create ensures that app (stored in processor_configs.vercel.svix) without
 *   touching any other processor_configs field;
 * - list/get/update/delete and sync reach webhooks in both apps;
 * - ids are unique across both apps;
 * - a webhook can't switch between vercel and non-vercel events.
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
const svix = createSvixCli();
const orgId = generateId("org");
let key: string;

const storedOrg = async () =>
	db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });

const vercelHook = {
	id: "provisioning",
	url: "https://example.com/it-vercel-provisioning",
	events: ["vercel.resources.provisioned"],
};
const mainHook = {
	id: "billing",
	url: "https://example.com/it-vercel-billing",
	events: ["billing.updated"],
};

beforeAll(async () => {
	await db.insert(organizations).values({
		id: orgId,
		slug: `it-webhooks-vercel-${orgId}`,
		name: "Webhooks vercel test",
		logo: "",
		createdAt: new Date(),
		metadata: "",
		svix_config: { sandbox_app_id: "", live_app_id: "" },
		processor_configs: {
			vercel: {
				client_integration_id: "keep_me",
				svix: { live_id: "app_live_untouched" },
			},
			revenuecat: { project_id: "rc_keep" },
		} as never,
	});
	key = await createKey({
		db,
		env: AppEnv.Sandbox,
		name: "Webhooks vercel key",
		orgId,
		prefix: ApiKeyPrefix.Sandbox,
		meta: {},
	});
});

afterAll(async () => {
	const org = await storedOrg();
	for (const appId of [
		org?.svix_config?.sandbox_app_id,
		org?.processor_configs?.vercel?.svix?.sandbox_id,
	])
		if (appId) await svix.application.delete(appId).catch(() => {});
	await db.delete(apiKeys).where(eq(apiKeys.org_id, orgId));
	await db.delete(organizations).where(eq(organizations.id, orgId));
});

test("a vercel-only webhook lives in the Vercel app, which is ensured without clobbering processor_configs", async () => {
	const created = await postWebhooks({
		route: "create",
		body: vercelHook,
		key,
	});
	expect(created.status).toBe(200);
	expect(created.body.secret).toMatch(/^whsec_/);

	const org = await storedOrg();
	const vercelAppId = org?.processor_configs?.vercel?.svix?.sandbox_id;
	expect(vercelAppId).toMatch(/^app_/);
	expect(org?.processor_configs?.vercel?.client_integration_id).toBe("keep_me");
	expect(org?.processor_configs?.vercel?.svix?.live_id).toBe(
		"app_live_untouched",
	);
	expect(org?.processor_configs?.revenuecat?.project_id).toBe("rc_keep");

	const inVercelApp = await svix.endpoint.get(
		vercelAppId as string,
		vercelHook.id,
	);
	expect(inVercelApp.url).toBe(vercelHook.url);
	const mainAppId = org?.svix_config?.sandbox_app_id as string;
	await expect(svix.endpoint.get(mainAppId, vercelHook.id)).rejects.toThrow();

	expect(
		(await postWebhooks({ route: "create", body: mainHook, key })).status,
	).toBe(200);
	const list = await postWebhooks({ route: "list", body: {}, key });
	expect(list.body.list.map((w: { id: string }) => w.id).sort()).toEqual([
		"billing",
		"provisioning",
	]);
	expect(
		(await postWebhooks({ route: "get", body: { id: "provisioning" }, key }))
			.body.url,
	).toBe(vercelHook.url);
	const updated = await postWebhooks({
		route: "update",
		body: { id: "provisioning", disabled: true },
		key,
	});
	expect(updated.body.disabled).toBe(true);
});

test("ids are unique across both apps, and a webhook can't switch between vercel and other events", async () => {
	const duplicate = await postWebhooks({
		route: "create",
		body: { ...mainHook, id: "provisioning" },
		key,
	});
	expect(duplicate.status).toBe(409);

	const toVercel = await postWebhooks({
		route: "update",
		body: { id: "billing", events: ["vercel.resources.deleted"] },
		key,
	});
	expect(toVercel.status).toBe(400);
	expect(toVercel.body.message).toContain("make a new webhook");

	const preview = await postWebhooks({
		route: "preview_sync",
		body: { webhooks: [{ ...vercelHook, events: ["billing.updated"] }] },
		key,
	});
	expect(preview.body.errors.map((e: { id: string }) => e.id)).toEqual([
		"provisioning",
	]);
});

test("sync creates a vercel webhook in the Vercel app and deletes reach both apps", async () => {
	const synced = await postWebhooks({
		route: "sync",
		body: {
			webhooks: [
				{
					id: "deletions",
					url: "https://example.com/it-vercel-del",
					events: ["vercel.resources.deleted"],
				},
			],
		},
		key,
	});
	expect(synced.status).toBe(200);
	expect(synced.body.secrets.map((s: { id: string }) => s.id)).toEqual([
		"deletions",
	]);
	const vercelAppId = (await storedOrg())?.processor_configs?.vercel?.svix
		?.sandbox_id as string;
	expect((await svix.endpoint.get(vercelAppId, "deletions")).url).toBe(
		"https://example.com/it-vercel-del",
	);

	for (const id of ["deletions", "provisioning", "billing"])
		expect(
			(await postWebhooks({ route: "delete", body: { id }, key })).status,
		).toBe(200);
	expect(
		(await postWebhooks({ route: "list", body: {}, key })).body.list,
	).toEqual([]);
});
