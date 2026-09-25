/**
 * webhooks.preview_sync / webhooks.sync are PATCH over the whole set:
 * - preview reports create / update / unmanaged and writes nothing;
 * - sync creates missing, updates differing, never deletes the unmanaged one;
 * - secrets come back only for webhooks the sync created;
 * - a repeat preview of the same body shows nothing for the stated ids.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	deleteSvixEndpoints,
	postWebhooks,
	testOrgSandboxAppId,
} from "./utils/webhookTestUtils.js";

const appId = testOrgSandboxAppId();
const ids = ["it-sync-existing", "it-sync-new", "it-sync-unmanaged"];

const stated = [
	{
		id: "it-sync-existing",
		url: "https://example.com/it-sync-moved",
		events: ["billing.updated"],
	},
	{
		id: "it-sync-new",
		url: "https://example.com/it-sync-new",
		events: ["invoice.finalized"],
	},
];

const changesFor = (changes: { id: string; action: string }[]) =>
	Object.fromEntries(
		changes
			.filter((change) => ids.includes(change.id))
			.map((change) => [change.id, change.action]),
	);

beforeAll(async () => {
	await deleteSvixEndpoints({ appId, ids });
	for (const id of ["it-sync-existing", "it-sync-unmanaged"]) {
		const { status } = await postWebhooks({
			route: "create",
			body: {
				id,
				url: `https://example.com/${id}`,
				events: ["billing.updated"],
			},
		});
		expect(status).toBe(200);
	}
});

afterAll(async () => {
	await deleteSvixEndpoints({ appId, ids });
});

test("preview_sync then sync: create + update applied, unmanaged kept, secret only for the new one", async () => {
	const preview = await postWebhooks({
		route: "preview_sync",
		body: { webhooks: stated },
	});
	expect(preview.status).toBe(200);
	expect(changesFor(preview.body.changes)).toEqual({
		"it-sync-existing": "update",
		"it-sync-new": "create",
		"it-sync-unmanaged": "unmanaged",
	});
	const notYetCreated = await postWebhooks({
		route: "get",
		body: { id: "it-sync-new" },
	});
	expect(notYetCreated.status).toBe(404);

	const synced = await postWebhooks({
		route: "sync",
		body: { webhooks: stated },
	});
	expect(synced.status).toBe(200);
	expect(
		synced.body.webhooks.map((webhook: { id: string; url: string }) => [
			webhook.id,
			webhook.url,
		]),
	).toEqual(stated.map((webhook) => [webhook.id, webhook.url]));
	expect(synced.body.secrets).toHaveLength(1);
	expect(synced.body.secrets[0].id).toBe("it-sync-new");
	expect(synced.body.secrets[0].secret).toMatch(/^whsec_/);

	const unmanaged = await postWebhooks({
		route: "get",
		body: { id: "it-sync-unmanaged" },
	});
	expect(unmanaged.status).toBe(200);

	const again = await postWebhooks({
		route: "preview_sync",
		body: { webhooks: stated },
	});
	expect(changesFor(again.body.changes)).toEqual({
		"it-sync-unmanaged": "unmanaged",
	});
});
