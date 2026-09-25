/**
 * webhooks.create/get/list/update/delete against the real sandbox Svix app:
 * - create returns the signing secret once; get and list never do;
 * - the id is stored as the Svix uid, so a second create with it is a 409;
 * - duplicate URLs are allowed (Svix accepts them);
 * - update patches only stated fields and cannot rename;
 * - localhost URLs and empty events are 400s on the request path;
 * - write routes need organisation:write, read routes organisation:read.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppEnv, apiKeys, ErrCode, Scopes } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
	hashApiKey,
} from "@/internal/dev/apiKeys/apiKeyUtils.js";
import {
	deleteSvixEndpoints,
	postWebhooks,
	testOrgSandboxAppId,
} from "./utils/webhookTestUtils.js";

const { db } = initDrizzle();
const appId = testOrgSandboxAppId();
const ids = [
	"it-crud-Billing",
	"it-crud-dup-url",
	"it-crud-dup-url-2",
	"it-crud-scopes",
	"it-crud-local",
];
const URL_A = "https://example.com/it-crud-hook";
let readOnlyKey: string;

beforeAll(async () => {
	await deleteSvixEndpoints({ appId, ids });
	readOnlyKey = await createKey({
		db,
		env: AppEnv.Sandbox,
		name: "Webhooks read-only key",
		orgId: defaultCtx.org.id,
		prefix: ApiKeyPrefix.Sandbox,
		meta: {},
		scopes: [Scopes.Organisation.Read],
	});
});

afterAll(async () => {
	await deleteSvixEndpoints({ appId, ids });
	await db
		.delete(apiKeys)
		.where(eq(apiKeys.hashed_key, hashApiKey(readOnlyKey)));
});

describe("webhooks CRUD", () => {
	test("create → get → list → update → delete, secret shown once", async () => {
		const created = await postWebhooks({
			route: "create",
			body: {
				id: "it-crud-Billing",
				url: URL_A,
				events: ["billing.updated"],
				description: "crud test",
			},
		});
		expect(created.status).toBe(200);
		expect(created.body).toMatchObject({
			id: "it-crud-Billing",
			url: URL_A,
			events: ["billing.updated"],
			description: "crud test",
			disabled: false,
		});
		expect(created.body.secret).toMatch(/^whsec_/);

		const fetched = await postWebhooks({
			route: "get",
			body: { id: "it-crud-Billing" },
		});
		expect(fetched.status).toBe(200);
		expect(fetched.body.id).toBe("it-crud-Billing");
		expect(fetched.body).not.toHaveProperty("secret");

		const listed = await postWebhooks({ route: "list", body: {} });
		const inList = listed.body.list.find(
			(webhook: { id: string }) => webhook.id === "it-crud-Billing",
		);
		expect(inList).toBeDefined();
		expect(inList).not.toHaveProperty("secret");

		const duplicateId = await postWebhooks({
			route: "create",
			body: { id: "it-crud-Billing", url: URL_A, events: ["billing.updated"] },
		});
		expect(duplicateId.status).toBe(409);
		expect(duplicateId.body.code).toBe(ErrCode.DuplicateWebhookId);

		const updated = await postWebhooks({
			route: "update",
			body: {
				id: "it-crud-Billing",
				new_id: "it-crud-renamed",
				events: ["billing.updated", "invoice.finalized"],
				disabled: true,
			},
		});
		expect(updated.status).toBe(200);
		expect(updated.body).toMatchObject({
			id: "it-crud-Billing",
			url: URL_A,
			description: "crud test",
			disabled: true,
		});
		expect([...updated.body.events].sort()).toEqual([
			"billing.updated",
			"invoice.finalized",
		]);

		const deleted = await postWebhooks({
			route: "delete",
			body: { id: "it-crud-Billing" },
		});
		expect(deleted).toEqual({ status: 200, body: { success: true } });

		const gone = await postWebhooks({
			route: "get",
			body: { id: "it-crud-Billing" },
		});
		expect(gone.status).toBe(404);
		expect(gone.body.code).toBe(ErrCode.WebhookNotFound);
	});

	test("a second webhook may reuse a URL; localhost and empty events are 400s", async () => {
		const first = await postWebhooks({
			route: "create",
			body: { id: "it-crud-dup-url", url: URL_A, events: ["billing.updated"] },
		});
		const second = await postWebhooks({
			route: "create",
			body: {
				id: "it-crud-dup-url-2",
				url: URL_A,
				events: ["invoice.finalized"],
			},
		});
		expect([first.status, second.status]).toEqual([200, 200]);

		// https, so Svix itself would accept these: the 400s must be ours.
		const localhost = await postWebhooks({
			route: "create",
			body: {
				id: "it-crud-local",
				url: "https://127.0.0.1/hook",
				events: ["billing.updated"],
			},
		});
		expect(localhost.status).toBe(400);
		expect(localhost.body.message).toContain("private network");

		const noEvents = await postWebhooks({
			route: "create",
			body: { id: "it-crud-local", url: URL_A, events: [] },
		});
		expect(noEvents.status).toBe(400);
		expect(noEvents.body.message).toContain("at least one event");
	});

	test("an organisation:read key can list but not create", async () => {
		const listed = await postWebhooks({
			route: "list",
			body: {},
			key: readOnlyKey,
		});
		expect(listed.status).toBe(200);

		const created = await postWebhooks({
			route: "create",
			body: { id: "it-crud-scopes", url: URL_A, events: ["billing.updated"] },
			key: readOnlyKey,
		});
		expect(created.status).toBe(403);
	});
});
