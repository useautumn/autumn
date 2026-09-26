/**
 * ensure() creates the env's Svix app only when the org has none, and clears
 * the org cache after storing it, so the next request's org already carries
 * the id and reuses the app instead of creating another.
 */

import { beforeEach, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const calls = { createApp: 0, clearCache: [] as string[] };

await mockModuleWithRestore("@/external/svix/svixHelpers.js", () => ({
	createSvixApp: async () => {
		calls.createApp++;
		return { id: "app_created" };
	},
	deleteSvixApp: async () => {},
}));
await mockModuleWithRestore(
	"@/internal/orgs/orgUtils/clearOrgCache.js",
	() => ({
		clearOrgCache: async ({ orgId }: { orgId: string }) => {
			calls.clearCache.push(orgId);
		},
	}),
);

const { ensureSvixAppId } = await import(
	"@/internal/webhooks/actions/ensureSvixAppId.js"
);

const claimingDb = {
	update: () => ({
		set: () => ({
			where: () => ({ returning: async () => [{ id: "org_1" }] }),
		}),
	}),
};

const ctxFor = (svixConfig: Organization["svix_config"]) =>
	({
		db: claimingDb,
		env: AppEnv.Sandbox,
		org: { id: "org_1", slug: "acme", svix_config: svixConfig },
	}) as unknown as AutumnContext;

beforeEach(() => {
	calls.createApp = 0;
	calls.clearCache = [];
});

test("first call creates the app and clears the org cache; the next call reuses the stored id", async () => {
	const first = await ensureSvixAppId({
		ctx: ctxFor({ sandbox_app_id: "", live_app_id: "app_live" }),
	});
	expect(first).toBe("app_created");
	expect(calls.createApp).toBe(1);
	expect(calls.clearCache).toEqual(["org_1"]);

	const second = await ensureSvixAppId({
		ctx: ctxFor({ sandbox_app_id: first, live_app_id: "app_live" }),
	});
	expect(second).toBe("app_created");
	expect(calls.createApp).toBe(1);
});
