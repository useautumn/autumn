/**
 * skip_deletions on webhooks.preview_sync / webhooks.sync:
 * - false: every unstated endpoint in the env, id'd or dashboard-made (`ep_`),
 *   previews as `delete` and is deleted by sync;
 * - default (true): the same endpoints stay `unmanaged` and untouched.
 * Runs in its own sandbox org, since a delete-everything sync would wipe the
 * shared test org's endpoints from under other tests.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { postSandboxes, postWebhooks } from "./utils/webhookTestUtils.js";

const { db } = initDrizzle();
const svix = createSvixCli();
let sandbox: { id: string; key: string; appId: string };
let dashboardId: string;

const KEPT = {
	id: "it-del-kept",
	url: "https://example.com/it-del-kept",
	events: ["billing.updated"],
};

const actionsById = (changes: { id: string; action: string }[]) =>
	Object.fromEntries(changes.map((change) => [change.id, change.action]));

beforeAll(async () => {
	const created = await postSandboxes({
		route: "create",
		body: { name: `Webhooks-Deletions-${crypto.randomUUID()}` },
		key: defaultCtx.orgSecretKey,
	});
	expect(created.status).toBe(200);
	const key = created.body.secret_key;
	for (const id of [KEPT.id, "it-del-gone"]) {
		const res = await postWebhooks({
			route: "create",
			body: { ...KEPT, id, url: `https://example.com/${id}` },
			key,
		});
		expect(res.status).toBe(200);
	}
	const org = await OrgService.get({ db, orgId: created.body.id });
	const appId = org.svix_config?.sandbox_app_id as string;
	sandbox = { id: created.body.id, key, appId };
	const dashboard = await svix.endpoint.create(appId, {
		url: "https://example.com/it-del-dashboard",
		filterTypes: ["invoice.finalized"],
	});
	dashboardId = dashboard.id;
}, 120_000);

afterAll(async () => {
	if (!sandbox) return;
	await svix.application.delete(sandbox.appId).catch(() => {});
	await db
		.delete(organizations)
		.where(eq(organizations.id, sandbox.id))
		.catch(() => {});
});

test("by default, unstated webhooks stay unmanaged and survive sync", async () => {
	const body = { webhooks: [KEPT] };
	const preview = await postWebhooks({
		route: "preview_sync",
		body,
		key: sandbox.key,
	});
	expect(preview.status).toBe(200);
	expect(actionsById(preview.body.changes)).toEqual({
		"it-del-gone": "unmanaged",
		[dashboardId]: "unmanaged",
	});

	const synced = await postWebhooks({ route: "sync", body, key: sandbox.key });
	expect(synced.status).toBe(200);
	const listed = await postWebhooks({
		route: "list",
		body: {},
		key: sandbox.key,
	});
	expect(listed.body.list.map((w: { id: string }) => w.id).sort()).toEqual(
		[KEPT.id, "it-del-gone", dashboardId].sort(),
	);
}, 60_000);

test("skip_deletions false: an unstated id'd webhook and an unstated ep_ webhook are previewed as deletes, then deleted", async () => {
	const body = { webhooks: [KEPT], skip_deletions: false };
	const preview = await postWebhooks({
		route: "preview_sync",
		body,
		key: sandbox.key,
	});
	expect(preview.status).toBe(200);
	expect(actionsById(preview.body.changes)).toEqual({
		"it-del-gone": "delete",
		[dashboardId]: "delete",
	});
	const stillThere = await postWebhooks({
		route: "get",
		body: { id: "it-del-gone" },
		key: sandbox.key,
	});
	expect(stillThere.status).toBe(200);

	const synced = await postWebhooks({ route: "sync", body, key: sandbox.key });
	expect(synced.status).toBe(200);
	expect(synced.body.errors).toEqual([]);

	const listed = await postWebhooks({
		route: "list",
		body: {},
		key: sandbox.key,
	});
	expect(listed.body.list.map((w: { id: string }) => w.id)).toEqual([KEPT.id]);
}, 60_000);
