/** Webhook cache refresh must flush Redis balances before wiping the subject. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
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
	idempotencyKey,
	preserveCache = false,
	finalContext,
}: {
	eventType: string;
	billingReason?: string;
	idempotencyKey?: string;
	preserveCache?: boolean;
	finalContext?: StripeSubscriptionUpdatedContext;
}) => {
	deleteCalls.length = 0;

	const app = new Hono<StripeWebhookHonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			fullCustomer: { id: "cus_remy" },
			stripeEvent: {
				type: eventType,
				request: idempotencyKey
					? { id: "req_autumn", idempotency_key: idempotencyKey }
					: null,
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
	app.post("/", (c) => {
		c.get("ctx").skipSubjectCacheDeletion = preserveCache;
		if (finalContext) {
			c.get("ctx").handlerResult = {
				type: "customer.subscription.updated",
				context: finalContext,
			};
		}
		return c.json({ received: true });
	});

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

	test("refreshes Autumn-originated subscription updates without a completed handler result", async () => {
		const response = await postWebhook({
			eventType: "customer.subscription.updated",
			idempotencyKey: "autumn:track:test",
		});

		expect(response.status).toBe(200);
		expect(deleteCalls).toHaveLength(1);
		expect(deleteCalls[0]?.flushBalances).toBe(true);
	});

	test("skips refresh based on the final subscription context", async () => {
		const response = await postWebhook({
			eventType: "customer.subscription.updated",
			idempotencyKey: "autumn:track:test",
			finalContext: {
				updatedCustomerProducts: [],
				insertedCustomerProducts: [],
				deletedCustomerProducts: [],
				results: { errors: [] },
			} as unknown as StripeSubscriptionUpdatedContext,
		});

		expect(response.status).toBe(200);
		expect(deleteCalls).toHaveLength(0);
	});

	test("refreshes when the final subscription context records an uncertain result", async () => {
		await postWebhook({
			eventType: "customer.subscription.updated",
			idempotencyKey: "autumn:track:test",
			finalContext: {
				updatedCustomerProducts: [],
				insertedCustomerProducts: [],
				deletedCustomerProducts: [],
				results: { errors: [], subscription: null },
			} as unknown as StripeSubscriptionUpdatedContext,
		});
		expect(deleteCalls).toHaveLength(1);
	});

	test("still honors a cache published by the handler", async () => {
		await postWebhook({
			eventType: "checkout.session.completed",
			preserveCache: true,
		});
		expect(deleteCalls).toHaveLength(0);
	});

	test("does not use a subscription-update result for another event type", async () => {
		await postWebhook({
			eventType: "customer.subscription.created",
			idempotencyKey: "autumn:billing:test",
			finalContext: {
				updatedCustomerProducts: [],
				insertedCustomerProducts: [],
				deletedCustomerProducts: [],
				results: { errors: [] },
			} as unknown as StripeSubscriptionUpdatedContext,
		});
		expect(deleteCalls).toHaveLength(1);
	});
});

afterAll(() => {
	mock.restore();
});
