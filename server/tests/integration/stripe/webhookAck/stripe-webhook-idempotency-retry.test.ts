import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { Hono } from "hono";
import type Stripe from "stripe";
import { getMiscRedis } from "@/external/redis/initRedis";
import { stripeIdempotencyMiddleware } from "@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware";
import { stripeWebhookAckMiddleware } from "@/external/stripe/webhookMiddlewares/stripeWebhookAckMiddleware";

const REDIS_READY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;

const waitForRedisReady = async () => {
	const deadline = Date.now() + REDIS_READY_TIMEOUT_MS;
	while (getMiscRedis().status !== "ready") {
		if (Date.now() > deadline) {
			throw new Error(
				`Redis never became ready (status: ${getMiscRedis().status})`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
};

const CONDITION_TIMEOUT_MS = 5000;

const waitForCondition = async ({
	condition,
	description,
}: {
	condition: () => Promise<boolean>;
	description: string;
}) => {
	const deadline = Date.now() + CONDITION_TIMEOUT_MS;
	while (!(await condition())) {
		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting for: ${description}`);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
};

const buildSyncEvent = (eventId: string): Stripe.Event =>
	({
		id: eventId,
		type: "customer.subscription.updated",
		data: { object: { metadata: {} } },
		request: null,
	}) as unknown as Stripe.Event;

const buildEarlyEvent = (eventId: string): Stripe.Event =>
	({
		id: eventId,
		type: "invoice.created",
		data: { object: { billing_reason: "manual" } },
		request: null,
	}) as unknown as Stripe.Event;

const createWebhookApp = ({
	orgId,
	event,
	handler,
}: {
	orgId: string;
	event: Stripe.Event;
	handler: () => Response | Promise<Response>;
}) => {
	const app = new Hono();

	app.use("*", async (c, next) => {
		(c as never as { set: (key: string, value: unknown) => void }).set("ctx", {
			org: { id: orgId },
			env: "sandbox",
			stripeEvent: event,
			logger: { error: () => {}, warn: () => {}, info: () => {} },
		});
		await next();
	});

	app.post(
		"/webhook",
		stripeIdempotencyMiddleware as never,
		stripeWebhookAckMiddleware as never,
		handler as never,
	);

	return app;
};

const redisKeyFor = ({ orgId, eventId }: { orgId: string; eventId: string }) =>
	`stripe:webhook:${orgId}:sandbox:${eventId}`;

test.concurrent(
	`${chalk.yellowBright("webhookAck: successful sync event dedupes redeliveries without re-running the handler")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_ack_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		let handlerRuns = 0;

		const app = createWebhookApp({
			orgId,
			event: buildSyncEvent(eventId),
			handler: () => {
				handlerRuns++;
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const first = await app.request("/webhook", { method: "POST" });
		expect(first.status).toBe(200);
		expect(handlerRuns).toBe(1);

		const stored = await getMiscRedis().get(redisKeyFor({ orgId, eventId }));
		expect(stored).toBe("completed");

		const second = await app.request("/webhook", { method: "POST" });
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ received: true, duplicate: true });
		expect(handlerRuns).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("webhookAck: failed sync event returns 500 and a retry reprocesses it (outage regression)")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_ack_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		let handlerRuns = 0;

		const app = createWebhookApp({
			orgId,
			event: buildSyncEvent(eventId),
			handler: () => {
				handlerRuns++;
				if (handlerRuns === 1) {
					throw new Error("simulated outage: handler dependency down");
				}
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const first = await app.request("/webhook", { method: "POST" });
		expect(first.status).toBe(500);
		expect(handlerRuns).toBe(1);

		const afterFailure = await getMiscRedis().get(
			redisKeyFor({ orgId, eventId }),
		);
		expect(afterFailure).toBeNull();

		const retry = await app.request("/webhook", { method: "POST" });
		expect(retry.status).toBe(200);
		expect(handlerRuns).toBe(2);

		const afterSuccess = await getMiscRedis().get(
			redisKeyFor({ orgId, eventId }),
		);
		expect(afterSuccess).toBe("completed");
	},
);

test.concurrent(
	`${chalk.yellowBright("webhookAck: duplicate delivery of an in-flight sync event returns 500, not a false ack")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_ack_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		let resolveProcessing!: () => void;
		const processing = new Promise<void>((resolve) => {
			resolveProcessing = resolve;
		});

		const app = createWebhookApp({
			orgId,
			event: buildSyncEvent(eventId),
			handler: async () => {
				await processing;
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const firstDelivery = app.request("/webhook", { method: "POST" });
		await waitForCondition({
			condition: async () =>
				(await getMiscRedis().get(redisKeyFor({ orgId, eventId }))) ===
				"processing",
			description: "first delivery to acquire the processing lock",
		});

		const duplicate = await app.request("/webhook", { method: "POST" });
		expect(duplicate.status).toBe(500);

		resolveProcessing();
		const first = await firstDelivery;
		expect(first.status).toBe(200);
	},
);

test.concurrent(
	`${chalk.yellowBright("webhookAck: early event acks immediately and marks completed after background success")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_ack_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		let handlerRuns = 0;

		const app = createWebhookApp({
			orgId,
			event: buildEarlyEvent(eventId),
			handler: () => {
				handlerRuns++;
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const first = await app.request("/webhook", { method: "POST" });
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({ received: true });

		await waitForCondition({
			condition: async () =>
				(await getMiscRedis().get(redisKeyFor({ orgId, eventId }))) ===
				"completed",
			description: "early-ack background processing to mark completed",
		});
		expect(handlerRuns).toBe(1);

		const duplicate = await app.request("/webhook", { method: "POST" });
		expect(duplicate.status).toBe(200);
		expect(await duplicate.json()).toEqual({ received: true, duplicate: true });
		expect(handlerRuns).toBe(1);
	},
);
