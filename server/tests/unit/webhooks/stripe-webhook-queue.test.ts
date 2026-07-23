import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import {
	enqueueStripeWebhook,
	getStripeWebhookQueueIds,
	queueStripeWebhook,
} from "@/external/stripe/stripeWebhookQueue.js";
import { JobName } from "@/queue/JobName.js";

const subscriptionEvent = {
	id: "evt_123",
	type: "customer.subscription.updated",
	account: "acct_123",
	data: { object: { id: "sub_123", customer: "cus_123" } },
} as Stripe.Event;

describe("Stripe webhook queue", () => {
	test("orders customer events together and deduplicates by event", () => {
		expect(
			getStripeWebhookQueueIds({
				event: subscriptionEvent,
				orgId: "org_123",
				env: AppEnv.Live,
			}),
		).toEqual({
			messageGroupId: "org_123:live:cus_123",
			messageDeduplicationId: "org_123:live:evt_123",
		});
	});

	test("falls back to the Stripe account for customerless events", () => {
		const event = {
			...subscriptionEvent,
			type: "price.updated",
			data: { object: { id: "price_123" } },
		} as Stripe.Event;

		expect(
			getStripeWebhookQueueIds({
				event,
				orgId: "org_123",
				env: AppEnv.Live,
			}).messageGroupId,
		).toBe("org_123:live:acct_123");
	});

	test("uses the dedicated queue and propagates enqueue failures", async () => {
		const error = new Error("SQS unavailable");
		const enqueue = async (input: unknown) => {
			expect(input).toEqual({
				jobName: JobName.StripeWebhook,
				payload: {
					orgId: "org_123",
					env: "live",
					event: subscriptionEvent,
					requestId: "req_123",
					receivedAtMs: 123,
				},
				queueUrl: "https://sqs.test/stripe.fifo",
				messageGroupId: "org_123:live:cus_123",
				messageDeduplicationId: "org_123:live:evt_123",
			});
			throw error;
		};

		await expect(
			enqueueStripeWebhook({
				ctx: {
					org: { id: "org_123" },
					env: "live",
					id: "req_123",
					timestamp: 123,
					stripeEvent: subscriptionEvent,
				} as never,
				queueUrl: "https://sqs.test/stripe.fifo",
				enqueue: enqueue as never,
				getSubscriptionLock: async () => null,
			}),
		).rejects.toBe(error);
	});

	test("snapshots subscription locks before enqueueing", async () => {
		let payload: unknown;

		await enqueueStripeWebhook({
			ctx: {
				org: { id: "org_123" },
				env: "live",
				id: "req_123",
				timestamp: 123,
				stripeEvent: subscriptionEvent,
			} as never,
			queueUrl: "https://sqs.test/stripe.fifo",
			enqueue: (async (input: { payload: unknown }) => {
				payload = input.payload;
			}) as never,
			getSubscriptionLock: async () => ({ lockedAtMs: 100 }),
		});

		expect(payload).toMatchObject({
			receivedAtMs: 123,
			ingressSubscriptionLock: {
				stripeSubscriptionId: "sub_123",
				lock: { lockedAtMs: 100 },
			},
		});
	});

	test("does not fall back to the shared queue", async () => {
		await expect(
			enqueueStripeWebhook({
				ctx: {
					org: { id: "org_123" },
					env: "live",
					id: "req_123",
					timestamp: 123,
					stripeEvent: subscriptionEvent,
				} as never,
				queueUrl: "",
			}),
		).rejects.toThrow("STRIPE_WEBHOOK_SQS_QUEUE_URL");
	});

	test("rejects a non-FIFO queue", async () => {
		await expect(
			enqueueStripeWebhook({
				ctx: {
					org: { id: "org_123" },
					env: "live",
					id: "req_123",
					timestamp: 123,
					stripeEvent: subscriptionEvent,
				} as never,
				queueUrl: "https://sqs.test/stripe",
			}),
		).rejects.toThrow("must reference a FIFO queue");
	});

	test("returns 503 when the event cannot be durably enqueued", async () => {
		const queueUrl = process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL;
		delete process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL;

		try {
			const response = await queueStripeWebhook({
				get: () => ({
					org: { id: "org_123" },
					env: "live",
					id: "req_123",
					timestamp: 123,
					stripeEvent: subscriptionEvent,
					logger: { error: () => {} },
				}),
				json: (body: unknown, status: number) =>
					new Response(JSON.stringify(body), { status }),
			} as never);

			expect(response.status).toBe(503);
		} finally {
			if (queueUrl) process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL = queueUrl;
			else delete process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL;
		}
	});
});
