import { afterAll, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const deleteCalls: Record<string, unknown>[] = [];

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({
		deleteCachedFullCustomer: async (args: Record<string, unknown>) => {
			deleteCalls.push(args);
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/warmFullSubjectCache.js",
	() => ({ warmFullSubjectCache: () => undefined }),
);

import { refreshCacheMiddleware } from "@/honoMiddlewares/refreshCacheMiddleware.js";

describe("attach Checkout cache preservation", () => {
	test("does not clear balances when attach only returns Checkout", async () => {
		const app = new Hono<HonoEnv>();
		app.use("*", async (c, next) => {
			c.set("ctx", {
				customerId: "cus_checkout",
				preserveFullSubjectCache: true,
			} as AutumnContext);
			await next();
		});
		app.use("*", refreshCacheMiddleware);
		app.post("/v1/attach", (c) => c.json({ url: "https://checkout.test" }));

		const response = await app.request("http://localhost/v1/attach", {
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(deleteCalls).toHaveLength(0);
	});
});

afterAll(() => {
	mock.restore();
});
