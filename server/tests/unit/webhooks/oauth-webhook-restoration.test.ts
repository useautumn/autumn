import { beforeEach, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const org = {
	id: "org_revocation",
	test_stripe_connect: { revoked_account_id: "acct_revoked" },
	stripe_config: { test_api_key: "encrypted-test-key" },
} as Organization;
let deleted: string[];
let created: number;
let failWrite: boolean;
let matched: boolean;
const db = {
	update: () => ({
		set: () => ({
			where: () => ({
				returning: async () => {
					if (failWrite) throw new Error("database unavailable");
					return matched ? [{ id: org.id }] : [];
				},
			}),
		}),
	}),
} as unknown as DrizzleCli;

await mockModuleWithRestore("@autumn/env", () => ({
	getAutumnEnv: () => ({ AUTUMN_PUBLIC_API_URL: "https://example.com" }),
}));
await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: { get: async () => org },
}));
await mockModuleWithRestore(
	"@/internal/orgs/orgUtils/clearOrgCache.js",
	() => ({
		clearOrgCache: async () => {},
	}),
);
await mockModuleWithRestore("@/utils/encryptUtils.js", () => ({
	encryptData: () => "encrypted-webhook-secret",
}));
await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		webhookEndpoints: {
			create: async () => {
				created++;
				return { id: "we_created", secret: "whsec_test" };
			},
			del: async (id: string) => {
				deleted.push(id);
			},
		},
	}),
}));

const { restoreStripeWebhookAfterRevocation } = await import(
	"@/external/stripe/webhookHandlers/restoreStripeWebhookAfterRevocation.js"
);
const restore = () =>
	restoreStripeWebhookAfterRevocation({
		ctx: { db, org, env: AppEnv.Sandbox, logger },
		accountId: "acct_revoked",
	});

beforeEach(() => {
	deleted = [];
	created = 0;
	failWrite = false;
	matched = true;
});

test("removes a created endpoint when its signing secret cannot be persisted", async () => {
	failWrite = true;
	await expect(restore()).rejects.toThrow(
		"Failed to restore direct Stripe webhook",
	);
	expect(created).toBe(1);
	expect(deleted).toEqual(["we_created"]);
});

test("removes a created endpoint when the connection changes before persistence", async () => {
	matched = false;
	await expect(restore()).rejects.toThrow(
		"Failed to restore direct Stripe webhook",
	);
	expect(deleted).toEqual(["we_created"]);
});

test("keeps the endpoint once its signing secret has been persisted", async () => {
	await restore();
	expect(created).toBe(1);
	expect(deleted).toEqual([]);
});
