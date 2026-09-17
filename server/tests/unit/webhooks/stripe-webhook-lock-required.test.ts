/**
 * The webhook idempotency middleware fails open when Redis is unavailable so
 * an outage does not stall every Stripe event. Cycle invoice.created events
 * write usage lines to Stripe, so two overlapping deliveries could bill twice;
 * without the lock they must be 500ed so Stripe retries once Redis is back.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type Stripe from "stripe";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

await mockModuleWithRestore("@/external/redis/initRedis", () => ({
	getMiscRedis: () => ({
		set: async () => {
			throw new Error("redis down");
		},
		get: async () => {
			throw new Error("redis down");
		},
		del: async () => undefined,
	}),
}));

const { stripeIdempotencyMiddleware } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js?lockRequired"
);

const buildEvent = ({
	type,
	billingReason,
}: {
	type: string;
	billingReason?: string;
}): Stripe.Event =>
	({
		id: `evt_${type}_${billingReason ?? "none"}`,
		type,
		data: { object: { billing_reason: billingReason, metadata: {} } },
		request: null,
	}) as unknown as Stripe.Event;

let handlerRuns = 0;

const createApp = (event: Stripe.Event) => {
	const app = new Hono();
	app.use("*", async (c, next) => {
		(c as never as { set: (key: string, value: unknown) => void }).set("ctx", {
			org: { id: "org_lock" },
			env: "sandbox",
			stripeEvent: event,
			logger: { error: () => {}, warn: () => {}, info: () => {} },
		});
		await next();
	});
	app.post("/webhook", stripeIdempotencyMiddleware as never, () => {
		handlerRuns++;
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	});
	return app;
};

describe("stripeIdempotencyMiddleware without Redis", () => {
	beforeEach(() => {
		handlerRuns = 0;
	});

	test("asks Stripe to retry a cycle invoice.created instead of running unlocked", async () => {
		const app = createApp(
			buildEvent({
				type: "invoice.created",
				billingReason: "subscription_cycle",
			}),
		);

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			received: false,
			lock_unavailable: true,
		});
		expect(handlerRuns).toBe(0);
	});

	test("still fails open for other events", async () => {
		const app = createApp(
			buildEvent({ type: "invoice.created", billingReason: "manual" }),
		);

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(200);
		expect(handlerRuns).toBe(1);
	});
});

afterAll(() => {
	mock.restore();
});
