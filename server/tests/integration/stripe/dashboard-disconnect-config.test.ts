import { expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { eq } from "drizzle-orm";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";

/** Red: disconnect writes stripe_config from the cached org and drops a concurrent key.
 * Green: only the disconnected keys change; concurrently written keys survive. */
test("dashboard Stripe disconnect preserves stripe_config keys written concurrently", async () => {
	const { ctx, autumnV2_3 } = await initScenario({
		setup: [s.platform.create({ name: "Dashboard disconnect config" })],
		actions: [],
	});
	try {
		const testKey = encryptData("sk_test_disconnect_fixture");
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { stripe_config: { test_api_key: testKey } },
		});
		await autumnV2_3.get("/organization");

		// Bypasses cache invalidation, so the request below authenticates with the pre-write org.
		const liveKey = encryptData("sk_live_written_concurrently");
		await ctx.db
			.update(organizations)
			.set({ stripe_config: { test_api_key: testKey, live_api_key: liveKey } })
			.where(eq(organizations.id, ctx.org.id));

		await autumnV2_3.delete("/organization/stripe");

		const org = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
		expect(org.stripe_config?.test_api_key ?? null).toBeNull();
		expect(org.stripe_config?.live_api_key).toBe(liveKey);
	} finally {
		await deletePlatformSubOrg({
			db: ctx.db,
			org: ctx.org,
			logger: ctx.logger,
			skipLiveCustomerCheck: true,
		});
	}
}, 120_000);
