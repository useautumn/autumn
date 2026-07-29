/**
 * TDD test for selective sync-ack of Stripe webhooks + Autumn origin detection.
 *
 * Contract under test:
 *   New types/fields:
 *     - classifyStripeWebhookAckMode({ event, now? }) -> "early" | "sync"
 *     - buildAutumnStripeIdempotencyKey / autumnStripeRequestOptions -> keys prefixed "autumn:"
 *     - isAutumnOriginatedStripeEvent({ event }) -> event.request.idempotency_key prefix test
 *     - StripeWebhookContext.webhookAckMode / webhookIdempotency hooks
 *   New behaviors (classifier policy):
 *     - checkout.session.completed / expired -> sync (always, even when Autumn-originated)
 *     - invoice.paid with metadata.autumn_metadata_id -> sync; otherwise early
 *     - invoice.finalized with metadata.vercel_installation_id -> sync; otherwise early
 *     - invoice.created with billing_reason subscription_cycle -> sync; otherwise early
 *     - customer.updated -> sync (pure external mirror, cheap handler)
 *     - customer.subscription.created/updated/deleted with autumn idempotency key on
 *       event.request -> early; with autumn-managed metadata (recent for updated/deleted,
 *       any age for created) -> early; otherwise sync
 *     - all other event types, or missing event -> early
 *   New behaviors (ack middleware):
 *     - sync mode: response waits for processing; success -> handler response +
 *       markCompleted(); unhandled error -> 500 + release() (so Stripe retries)
 *     - early mode: immediate 200 {received:true}; background success -> markCompleted();
 *       background failure -> release()
 *   Side effects:
 *     - Redis two-state idempotency semantics are covered by the integration test
 *       tests/integration/stripe/webhookAck/stripe-webhook-idempotency-retry.test.ts
 *
 * Pre-impl red: classifyStripeWebhookAckMode, autumnStripeIdempotency, and
 * stripeWebhookAckMiddleware do not exist yet.
 * Post-impl green: classifier + renamed ack middleware implement the policy above.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type Stripe from "stripe";
import {
	autumnStripeRequestOptions,
	buildAutumnStripeIdempotencyKey,
	isAutumnOriginatedStripeEvent,
} from "@/external/stripe/common/autumnStripeIdempotency";
import { classifyStripeWebhookAckMode } from "@/external/stripe/webhookMiddlewares/classifyStripeWebhookAckMode";
import { stripeWebhookAckMiddleware } from "@/external/stripe/webhookMiddlewares/stripeWebhookAckMiddleware";

// Unit scope: the failure path must exercise idempotency hooks only, never a
// real SQS enqueue — force the replay queue off regardless of local env.
const originalReplayQueueUrl = process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL;
process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL = "";
afterAll(() => {
	process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL = originalReplayQueueUrl;
});

const waitForImmediate = () => new Promise((resolve) => setImmediate(resolve));

const TEN_MINUTES_MS = 10 * 60 * 1000;

const buildEvent = ({
	type,
	object = {},
	request = null,
}: {
	type: string;
	object?: Record<string, unknown>;
	request?: { id?: string; idempotency_key?: string | null } | null;
}): Stripe.Event =>
	({
		id: "evt_test",
		type,
		data: { object },
		request,
	}) as unknown as Stripe.Event;

// ── Contract: classifier policy table ────────────────────────────

describe("classifyStripeWebhookAckMode", () => {
	const cases: {
		name: string;
		event: Stripe.Event | undefined;
		expected: "early" | "sync";
	}[] = [
		{
			name: "checkout.session.completed -> sync",
			event: buildEvent({ type: "checkout.session.completed" }),
			expected: "sync",
		},
		{
			name: "checkout.session.completed stays sync even when Autumn-originated",
			event: buildEvent({
				type: "checkout.session.completed",
				request: { idempotency_key: "autumn:attach:abc" },
			}),
			expected: "sync",
		},
		{
			name: "checkout.session.expired -> sync",
			event: buildEvent({ type: "checkout.session.expired" }),
			expected: "sync",
		},
		{
			name: "invoice.paid with autumn_metadata_id -> sync",
			event: buildEvent({
				type: "invoice.paid",
				object: { metadata: { autumn_metadata_id: "meta_1" } },
			}),
			expected: "sync",
		},
		{
			name: "invoice.paid without autumn_metadata_id -> early",
			event: buildEvent({ type: "invoice.paid", object: { metadata: {} } }),
			expected: "early",
		},
		{
			name: "invoice.finalized with vercel_installation_id -> sync",
			event: buildEvent({
				type: "invoice.finalized",
				object: { metadata: { vercel_installation_id: "icfg_1" } },
			}),
			expected: "sync",
		},
		{
			name: "invoice.finalized without vercel metadata -> early",
			event: buildEvent({
				type: "invoice.finalized",
				object: { metadata: null },
			}),
			expected: "early",
		},
		{
			name: "invoice.created subscription_cycle -> sync",
			event: buildEvent({
				type: "invoice.created",
				object: { billing_reason: "subscription_cycle" },
			}),
			expected: "sync",
		},
		{
			name: "invoice.created manual -> early",
			event: buildEvent({
				type: "invoice.created",
				object: { billing_reason: "manual" },
			}),
			expected: "early",
		},
		{
			name: "invoice.created subscription_update -> early",
			event: buildEvent({
				type: "invoice.created",
				object: { billing_reason: "subscription_update" },
			}),
			expected: "early",
		},
		{
			name: "subscription.updated without markers -> sync",
			event: buildEvent({
				type: "customer.subscription.updated",
				object: { metadata: {} },
			}),
			expected: "sync",
		},
		{
			name: "subscription.updated with recent autumn_managed_at -> early",
			event: buildEvent({
				type: "customer.subscription.updated",
				object: { metadata: { autumn_managed_at: String(Date.now()) } },
			}),
			expected: "early",
		},
		{
			name: "subscription.updated with stale autumn_managed_at -> sync",
			event: buildEvent({
				type: "customer.subscription.updated",
				object: {
					metadata: {
						autumn_managed_at: String(Date.now() - TEN_MINUTES_MS - 1000),
					},
				},
			}),
			expected: "sync",
		},
		{
			name: "subscription.updated with autumn_managed_source -> early",
			event: buildEvent({
				type: "customer.subscription.updated",
				object: { metadata: { autumn_managed_source: "attach" } },
			}),
			expected: "early",
		},
		{
			name: "subscription.updated with autumn idempotency key -> early",
			event: buildEvent({
				type: "customer.subscription.updated",
				object: { metadata: {} },
				request: { idempotency_key: "autumn:updateSubscription:xyz" },
			}),
			expected: "early",
		},
		{
			name: "subscription.updated with foreign idempotency key -> sync",
			event: buildEvent({
				type: "customer.subscription.updated",
				object: { metadata: {} },
				request: { idempotency_key: "some-external-key" },
			}),
			expected: "sync",
		},
		{
			name: "subscription.created with stale autumn_managed_at -> early (any age)",
			event: buildEvent({
				type: "customer.subscription.created",
				object: {
					metadata: {
						autumn_managed_at: String(Date.now() - TEN_MINUTES_MS - 1000),
					},
				},
			}),
			expected: "early",
		},
		{
			name: "subscription.created without markers -> sync",
			event: buildEvent({
				type: "customer.subscription.created",
				object: { metadata: {} },
			}),
			expected: "sync",
		},
		{
			name: "subscription.deleted without markers -> sync",
			event: buildEvent({
				type: "customer.subscription.deleted",
				object: { metadata: {} },
			}),
			expected: "sync",
		},
		{
			name: "subscription.deleted with autumn idempotency key -> early",
			event: buildEvent({
				type: "customer.subscription.deleted",
				object: { metadata: {} },
				request: { idempotency_key: "autumn:updateSubscription:abc" },
			}),
			expected: "early",
		},
		{
			name: "customer.updated -> sync",
			event: buildEvent({ type: "customer.updated" }),
			expected: "sync",
		},
		{
			name: "customer.discount.deleted -> early (default)",
			event: buildEvent({ type: "customer.discount.deleted" }),
			expected: "early",
		},
		{
			name: "missing event -> early",
			event: undefined,
			expected: "early",
		},
	];

	for (const { name, event, expected } of cases) {
		test(name, () => {
			expect(classifyStripeWebhookAckMode({ event })).toBe(expected);
		});
	}
});

// ── Contract: autumn idempotency key helpers ─────────────────────

describe("autumnStripeIdempotency", () => {
	test("built keys carry the autumn prefix and are unique per call", () => {
		const first = buildAutumnStripeIdempotencyKey({ source: "attach" });
		const second = buildAutumnStripeIdempotencyKey({ source: "attach" });

		expect(first.startsWith("autumn:")).toBe(true);
		expect(first).toContain("attach");
		expect(first).not.toBe(second);
	});

	test("autumnStripeRequestOptions returns a fresh idempotencyKey", () => {
		const options = autumnStripeRequestOptions({ source: "invoice.create" });
		expect(options.idempotencyKey?.startsWith("autumn:")).toBe(true);
	});

	test("isAutumnOriginatedStripeEvent matches only autumn-prefixed request keys", () => {
		const autumnEvent = buildEvent({
			type: "customer.subscription.updated",
			request: { idempotency_key: "autumn:attach:abc" },
		});
		const foreignEvent = buildEvent({
			type: "customer.subscription.updated",
			request: { idempotency_key: "their-key" },
		});
		const naturalEvent = buildEvent({
			type: "customer.subscription.updated",
			request: null,
		});

		expect(isAutumnOriginatedStripeEvent({ event: autumnEvent })).toBe(true);
		expect(isAutumnOriginatedStripeEvent({ event: foreignEvent })).toBe(false);
		expect(isAutumnOriginatedStripeEvent({ event: naturalEvent })).toBe(false);
	});
});

// ── Contract: ack middleware behavior per mode ───────────────────

type HookCalls = { completed: number; released: number };

const createApp = ({
	event,
	handler,
}: {
	event: Stripe.Event;
	handler: (c: {
		json: (body: unknown, status: number) => Response;
	}) => Response | Promise<Response>;
}) => {
	const app = new Hono();
	const hookCalls: HookCalls = { completed: 0, released: 0 };

	app.use("*", async (c, next) => {
		(c as never as { set: (key: string, value: unknown) => void }).set("ctx", {
			logger: { error: () => {}, warn: () => {}, info: () => {} },
			stripeEvent: event,
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

const syncEvent = buildEvent({
	type: "customer.subscription.updated",
	object: { metadata: {} },
});

const earlyEvent = buildEvent({
	type: "invoice.created",
	object: { billing_reason: "manual" },
});

describe("stripeWebhookAckMiddleware sync mode", () => {
	test("waits for processing and returns the handler response, then marks completed", async () => {
		let processed = false;
		const { app, hookCalls } = createApp({
			event: syncEvent,
			handler: (c) => {
				processed = true;
				return c.json({ success: true }, 200);
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(processed).toBe(true);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(hookCalls.completed).toBe(1);
		expect(hookCalls.released).toBe(0);
	});

	test("returns 500 and releases the idempotency lock when processing throws", async () => {
		const { app, hookCalls } = createApp({
			event: syncEvent,
			handler: () => {
				throw new Error("handler exploded");
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(500);
		expect(hookCalls.completed).toBe(0);
		expect(hookCalls.released).toBe(1);
	});
});

describe("stripeWebhookAckMiddleware early mode", () => {
	test("acks immediately, then marks completed after background success", async () => {
		let resolveProcessing!: () => void;
		const processing = new Promise<void>((resolve) => {
			resolveProcessing = resolve;
		});
		let processed = false;

		const { app, hookCalls } = createApp({
			event: earlyEvent,
			handler: async (c) => {
				await processing;
				processed = true;
				return c.json({ success: true }, 200);
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(processed).toBe(false);

		resolveProcessing();
		await waitForImmediate();
		await waitForImmediate();

		expect(processed).toBe(true);
		expect(hookCalls.completed).toBe(1);
		expect(hookCalls.released).toBe(0);
	});

	test("still acks 200 but releases the lock when background processing fails", async () => {
		const { app, hookCalls } = createApp({
			event: earlyEvent,
			handler: () => {
				throw new Error("background failure");
			},
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });

		await waitForImmediate();
		await waitForImmediate();

		expect(hookCalls.completed).toBe(0);
		expect(hookCalls.released).toBe(1);
	});
});
