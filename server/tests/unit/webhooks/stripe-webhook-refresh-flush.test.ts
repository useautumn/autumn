/** Webhook cache refresh must flush Redis balances before wiping the subject. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const deleteCalls: Record<string, unknown>[] = [];

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({
		deleteCachedFullCustomer: async (args: Record<string, unknown>) => {
			deleteCalls.push(args);
		},
	}),
);

const { stripeWebhookRefreshMiddleware } = await import(
	"@/external/stripe/webhookMiddlewares/stripeWebhookRefreshMiddleware.js"
);

const postWebhook = async ({
	eventType,
	billingReason,
}: {
	eventType: string;
	billingReason?: string;
}) => {
	deleteCalls.length = 0;

	const app = new Hono<StripeWebhookHonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			fullCustomer: { id: "cus_remy" },
			stripeEvent: {
				type: eventType,
				data: {
					object: {
						customer: "cus_stripe",
						billing_reason: billingReason,
					},
				},
			},
			logger: {
				warn: () => {},
				error: () => {},
				info: () => {},
			},
		} as unknown as StripeWebhookContext);
		await next();
	});
	app.use("*", stripeWebhookRefreshMiddleware);
	app.post("/", (c) => c.json({ received: true }));

	return app.request("http://localhost/", { method: "POST" });
};

describe("stripe webhook cache refresh flush", () => {
	test("flushes cached balances before invalidating invoice.created", async () => {
		const response = await postWebhook({
			eventType: "invoice.created",
			billingReason: "subscription_create",
		});

		expect(response.status).toBe(200);
		expect(deleteCalls).toEqual([
			{
				customerId: "cus_remy",
				ctx: expect.anything(),
				source: "stripeWebhookRefreshMiddleware: invoice.created",
				flushBalances: true,
			},
		]);
	});

	test("skips refresh for manual invoices", async () => {
		const response = await postWebhook({
			eventType: "invoice.paid",
			billingReason: "manual",
		});

		expect(response.status).toBe(200);
		expect(deleteCalls).toHaveLength(0);
	});
});

afterAll(() => {
	mock.restore();
});
