/**
 * Omitting `events` means every event, the way a dashboard-made endpoint with
 * no filter works in Svix:
 * - create or sync with no `events` makes an endpoint with no filter;
 * - sync with no `events` widens a filtered endpoint, and repeating it is a no-op;
 * - update keeps the list when `events` is omitted and widens it on `[]`.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import {
	deleteSvixEndpoints,
	postWebhooks,
	testOrgSandboxAppId,
} from "./utils/webhookTestUtils.js";

const appId = testOrgSandboxAppId();
const ids = ["it-all-create", "it-all-sync-new", "it-all-sync-widen"];

const svixFilterTypes = async (id: string) =>
	(await createSvixCli().endpoint.get(appId, id)).filterTypes ?? [];

beforeAll(async () => {
	await deleteSvixEndpoints({ appId, ids });
});

afterAll(async () => {
	await deleteSvixEndpoints({ appId, ids });
});

test("create with no events makes an endpoint that receives every event", async () => {
	const created = await postWebhooks({
		route: "create",
		body: { id: "it-all-create", url: "https://example.com/it-all-create" },
	});
	expect(created.status).toBe(200);
	expect(created.body.events).toEqual([]);
	expect(await svixFilterTypes("it-all-create")).toEqual([]);

	const kept = await postWebhooks({
		route: "update",
		body: { id: "it-all-create", events: ["billing.updated"] },
	});
	expect(kept.body.events).toEqual(["billing.updated"]);
	const untouched = await postWebhooks({
		route: "update",
		body: { id: "it-all-create", disabled: true },
	});
	expect(untouched.body.events).toEqual(["billing.updated"]);

	const widened = await postWebhooks({
		route: "update",
		body: { id: "it-all-create", events: [] },
	});
	expect(widened.status).toBe(200);
	expect(widened.body.events).toEqual([]);
	expect(await svixFilterTypes("it-all-create")).toEqual([]);
});

test("sync with no events creates or widens to every event, and repeating it changes nothing", async () => {
	const narrowed = await postWebhooks({
		route: "create",
		body: {
			id: "it-all-sync-widen",
			url: "https://example.com/it-all-sync-widen",
			events: ["billing.updated"],
		},
	});
	expect(narrowed.status).toBe(200);

	const webhooks = [
		{ id: "it-all-sync-new", url: "https://example.com/it-all-sync-new" },
		{ id: "it-all-sync-widen", url: "https://example.com/it-all-sync-widen" },
	];
	const preview = await postWebhooks({
		route: "preview_sync",
		body: { webhooks },
	});
	expect(preview.status).toBe(200);
	const widen = preview.body.changes.find(
		(change: { id: string }) => change.id === "it-all-sync-widen",
	);
	expect(widen).toMatchObject({ action: "update", after: { events: [] } });

	const synced = await postWebhooks({ route: "sync", body: { webhooks } });
	expect(synced.status).toBe(200);
	expect(synced.body.errors).toEqual([]);
	expect(await svixFilterTypes("it-all-sync-new")).toEqual([]);
	expect(await svixFilterTypes("it-all-sync-widen")).toEqual([]);

	const again = await postWebhooks({
		route: "preview_sync",
		body: { webhooks },
	});
	expect(
		again.body.changes.filter(
			(change: { id: string; action: string }) => change.action !== "unmanaged",
		),
	).toEqual([]);
});
