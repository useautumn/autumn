/**
 * sync adopts webhooks made in the dashboard (no uid) by exact URL, and must
 * never create a duplicate:
 * - one uid-less match: adopted in place (same endpoint, same secret, uid set),
 *   previewed as `adopt`, and no secret in the sync response;
 * - several uid-less matches: a per-item error, nothing created;
 * - an endpoint that already has a uid is never adopted: the new id is created.
 */

import { afterAll, expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import {
	deleteSvixEndpoints,
	postWebhooks,
	testOrgSandboxAppId,
} from "./utils/webhookTestUtils.js";

const appId = testOrgSandboxAppId();
const svix = createSvixCli();
const createdEndpointIds: string[] = [];
const ids = [
	"it-adopt-single",
	"it-adopt-multi",
	"it-adopt-owner",
	"it-adopt-new",
];

const dashboardEndpoint = async ({ url }: { url: string }) => {
	const endpoint = await svix.endpoint.create(appId, {
		url,
		filterTypes: ["invoice.finalized"],
	});
	createdEndpointIds.push(endpoint.id);
	return endpoint;
};

const endpointsAt = async ({ url }: { url: string }) =>
	(await svix.endpoint.list(appId, { limit: 250 })).data.filter(
		(endpoint) => endpoint.url === url,
	);

afterAll(async () => {
	await deleteSvixEndpoints({ appId, ids: [...createdEndpointIds, ...ids] });
});

test("a single dashboard webhook with the URL is adopted in place, keeping its secret", async () => {
	const url = "https://example.com/it-adopt-single";
	const dashboard = await dashboardEndpoint({ url });
	const { key: secretBefore } = await svix.endpoint.getSecret(
		appId,
		dashboard.id,
	);
	const body = {
		webhooks: [{ id: "it-adopt-single", url, events: ["billing.updated"] }],
	};

	const preview = await postWebhooks({ route: "preview_sync", body });
	const change = preview.body.changes.find(
		(c: { id: string }) => c.id === "it-adopt-single",
	);
	expect(change).toMatchObject({
		action: "adopt",
		before: { id: dashboard.id, url },
		after: { id: "it-adopt-single", url, events: ["billing.updated"] },
	});

	const synced = await postWebhooks({ route: "sync", body });
	expect(synced.status).toBe(200);
	expect(synced.body.secrets).toEqual([]);
	expect(synced.body.errors).toEqual([]);
	expect(synced.body.webhooks).toMatchObject([
		{ id: "it-adopt-single", url, events: ["billing.updated"] },
	]);

	const atUrl = await endpointsAt({ url });
	expect(atUrl.map(({ id, uid }) => ({ id, uid }))).toEqual([
		{ id: dashboard.id, uid: "it-adopt-single" },
	]);
	const { key: secretAfter } = await svix.endpoint.getSecret(
		appId,
		dashboard.id,
	);
	expect(secretAfter).toBe(secretBefore);
});

test("several dashboard webhooks with the URL: error, nothing created", async () => {
	const url = "https://example.com/it-adopt-multi";
	await dashboardEndpoint({ url });
	await dashboardEndpoint({ url });
	const body = {
		webhooks: [{ id: "it-adopt-multi", url, events: ["billing.updated"] }],
	};

	const preview = await postWebhooks({ route: "preview_sync", body });
	expect(preview.body.errors).toEqual([
		{
			id: "it-adopt-multi",
			message: expect.stringContaining("2 dashboard webhooks"),
		},
	]);

	const synced = await postWebhooks({ route: "sync", body });
	expect(synced.status).toBe(409);
	expect(synced.body.code).toBe(ErrCode.AmbiguousWebhookUrl);

	const atUrl = await endpointsAt({ url });
	expect(atUrl.map(({ uid }) => uid ?? null)).toEqual([null, null]);
});

test("an endpoint that already has a uid is never adopted: the new id is created", async () => {
	const url = "https://example.com/it-adopt-owned";
	const owner = await postWebhooks({
		route: "create",
		body: { id: "it-adopt-owner", url, events: ["invoice.finalized"] },
	});
	expect(owner.status).toBe(200);

	const synced = await postWebhooks({
		route: "sync",
		body: {
			webhooks: [{ id: "it-adopt-new", url, events: ["billing.updated"] }],
		},
	});
	expect(synced.status).toBe(200);
	expect(synced.body.secrets).toEqual([
		{ id: "it-adopt-new", secret: expect.stringMatching(/^whsec_/) },
	]);

	const atUrl = await endpointsAt({ url });
	expect(atUrl.map(({ uid }) => uid).sort()).toEqual([
		"it-adopt-new",
		"it-adopt-owner",
	]);
});
