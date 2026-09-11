/**
 * Sync-ack failures that would 500 Stripe enqueue the in-house replay job,
 * except permanent Postgres foreign-key violations (those 500 Stripe only).
 *
 * Red (current):  a 23503 still lands on SQS and can DLQ after maxReceiveCount.
 * Green (after):  23503 returns 500 and does not enqueue.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type Stripe from "stripe";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const enqueueCalls: Array<{ failureReason: string }> = [];

await mockModuleWithRestore(
	"@/external/stripe/webhookReplay/enqueueStripeWebhookReplay.js",
	() => ({
		enqueueStripeWebhookReplay: async ({
			failureReason,
		}: {
			failureReason: string;
		}) => {
			enqueueCalls.push({ failureReason });
			return true;
		},
	}),
);

const { stripeWebhookAckMiddleware } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookMiddlewares/stripeWebhookAckMiddleware.js?syncAckReplay"
);

const checkoutCompleted = {
	id: "evt_checkout_test",
	type: "checkout.session.completed",
	data: { object: {} },
	request: null,
} as unknown as Stripe.Event;

const createApp = ({
	handler,
}: {
	handler: () => Response | Promise<Response>;
}) => {
	const app = new Hono();
	const hookCalls = { completed: 0, released: 0 };

	app.use("*", async (c, next) => {
		(c as never as { set: (key: string, value: unknown) => void }).set("ctx", {
			logger: { error: () => {}, warn: () => {}, info: () => {} },
			stripeEvent: checkoutCompleted,
			webhookAckMode: "sync",
			webhookIdempotency: {
				markCompleted: async () => {
					hookCalls.completed++;
				},
				release: async () => {
					hookCalls.released++;
				},
			},
		});
		await next();
	});

	app.post("/webhook", stripeWebhookAckMiddleware as never, handler as never);
	return { app, hookCalls };
};

beforeEach(() => {
	enqueueCalls.length = 0;
});

describe("sync webhook failure enqueues replay", () => {
	test("enqueues, releases, and 500s on a handler error Stripe would retry", async () => {
		const { app, hookCalls } = createApp({
			handler: () => {
				throw new Error("db connection reset");
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(500);
		expect(hookCalls.released).toBe(1);
		expect(hookCalls.completed).toBe(0);
		expect(enqueueCalls).toEqual([{ failureReason: "db connection reset" }]);
	});

	test("does not enqueue skipped webhook errors", async () => {
		const { app, hookCalls } = createApp({
			handler: () => {
				throw new Error("Not a valid URL");
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(500);
		expect(hookCalls.released).toBe(1);
		expect(enqueueCalls).toEqual([]);
	});

	test("500s Stripe but does not enqueue a foreign-key violation", async () => {
		const { app, hookCalls } = createApp({
			handler: () => {
				throw Object.assign(
					new Error(
						'insert or update on table "customer_prices" violates foreign key constraint "customer_prices_price_id_fkey"',
					),
					{ code: "23503" },
				);
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(500);
		expect(hookCalls.released).toBe(1);
		expect(hookCalls.completed).toBe(0);
		expect(enqueueCalls).toEqual([]);
	});
});
