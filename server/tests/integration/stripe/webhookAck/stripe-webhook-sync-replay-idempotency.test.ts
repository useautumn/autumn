/**
 * Worker replay and Stripe HTTP share the Redis claim. First success wins:
 * the other path must not run the handler again.
 *
 * Contract:
 *   - Worker completes → Stripe redelivery 200 {duplicate:true}, handler once
 *   - Stripe completes → worker no-ops, handler once
 *   - Stripe in-flight → worker throws InFlightError (no handler); after
 *     Stripe succeeds, both a worker retry and a Stripe retry skip
 *   - Worker in-flight → Stripe HTTP 500 in_flight (no handler); after
 *     worker succeeds, Stripe retry 200 {duplicate:true}
 *
 * Lives in integration because it uses the real Redis claim the route and
 * runStripeWebhookReplay both call.
 */

import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { Hono } from "hono";
import type Stripe from "stripe";
import { getMiscRedis } from "@/external/redis/initRedis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../../unit/utils/mockModuleWithRestore.js";

const originalReplayQueueUrl = process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL;
process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL = "";

const processCounts = new Map<string, number>();
const workerHold = new Map<string, Promise<void>>();

const bumpProcess = (eventId: string) => {
	processCounts.set(eventId, (processCounts.get(eventId) ?? 0) + 1);
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({ deleteCachedFullCustomer: async () => {} }),
);

await mockModuleWithRestore(
	"@/external/stripe/runStripeWebhookHandlers.js",
	() => ({
		runStripeWebhookHandlers: async ({ ctx }: { ctx: AutumnContext }) => {
			const eventId = (ctx as AutumnContext & { stripeEvent: Stripe.Event })
				.stripeEvent.id;
			const hold = workerHold.get(eventId);
			if (hold) await hold;
			bumpProcess(eventId);
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeSyncMiddleware.js",
	() => ({ syncStripeEventToSyncDb: () => {} }),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeToAutumnCustomerMiddleware.js",
	() => ({
		attachStripeEventCustomer: async ({ ctx }: { ctx: AutumnContext }) => ctx,
	}),
);

const { runStripeWebhookReplay, StripeWebhookReplayInFlightError } =
	await import(
		// @ts-expect-error - Bun cache-busting query isolates module mocks.
		"@/external/stripe/webhookReplay/runStripeWebhookReplay.js?syncReplayIdempotency"
	);

const { stripeIdempotencyMiddleware } = await import(
	"@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js"
);
const { stripeWebhookAckMiddleware } = await import(
	"@/external/stripe/webhookMiddlewares/stripeWebhookAckMiddleware.js"
);

const REDIS_READY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;
const CONDITION_TIMEOUT_MS = 5000;

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

const buildCheckoutEvent = (eventId: string): Stripe.Event =>
	({
		id: eventId,
		type: "checkout.session.completed",
		data: { object: {} },
		request: null,
	}) as unknown as Stripe.Event;

const redisKeyFor = ({ orgId, eventId }: { orgId: string; eventId: string }) =>
	`stripe:webhook:${orgId}:sandbox:${eventId}`;

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
			env: AppEnv.Sandbox,
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

const workerCtx = ({ orgId }: { orgId: string }) =>
	({
		org: { id: orgId },
		env: AppEnv.Sandbox,
		logger: { info: () => {}, error: () => {}, warn: () => {} },
	}) as unknown as AutumnContext;

const replay = ({
	orgId,
	event,
}: {
	orgId: string;
	event: Stripe.Event;
}) =>
	runStripeWebhookReplay({
		ctx: workerCtx({ orgId }),
		payload: {
			orgId,
			env: AppEnv.Sandbox,
			stripeEvent: event,
			failedAt: Date.now(),
			failureReason: "test",
		},
	});

test.concurrent(
	`${chalk.yellowBright("webhookAck: worker success then Stripe retry 200s without reprocessing")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_replay_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		const event = buildCheckoutEvent(eventId);

		const app = createWebhookApp({
			orgId,
			event,
			handler: () => {
				bumpProcess(eventId);
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		await replay({ orgId, event });
		expect(processCounts.get(eventId)).toBe(1);
		expect(await getMiscRedis().get(redisKeyFor({ orgId, eventId }))).toBe(
			"completed",
		);

		const stripeRetry = await app.request("/webhook", { method: "POST" });
		expect(stripeRetry.status).toBe(200);
		expect(await stripeRetry.json()).toEqual({
			received: true,
			duplicate: true,
		});
		expect(processCounts.get(eventId)).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("webhookAck: Stripe success then worker skip without reprocessing")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_replay_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		const event = buildCheckoutEvent(eventId);

		const app = createWebhookApp({
			orgId,
			event,
			handler: () => {
				bumpProcess(eventId);
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const first = await app.request("/webhook", { method: "POST" });
		expect(first.status).toBe(200);
		expect(processCounts.get(eventId)).toBe(1);

		await replay({ orgId, event });
		expect(processCounts.get(eventId)).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("webhookAck: Stripe in-flight blocks the worker; after success neither reprocesses")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_replay_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		const event = buildCheckoutEvent(eventId);
		let resolveProcessing!: () => void;
		const processing = new Promise<void>((resolve) => {
			resolveProcessing = resolve;
		});

		const app = createWebhookApp({
			orgId,
			event,
			handler: async () => {
				await processing;
				bumpProcess(eventId);
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const stripeDelivery = app.request("/webhook", { method: "POST" });
		await waitForCondition({
			condition: async () =>
				(await getMiscRedis().get(redisKeyFor({ orgId, eventId }))) ===
				"processing",
			description: "Stripe delivery to acquire the processing lock",
		});

		await expect(replay({ orgId, event })).rejects.toBeInstanceOf(
			StripeWebhookReplayInFlightError,
		);
		expect(processCounts.get(eventId) ?? 0).toBe(0);

		resolveProcessing();
		expect((await stripeDelivery).status).toBe(200);
		expect(processCounts.get(eventId)).toBe(1);

		await replay({ orgId, event });
		const stripeRetry = await app.request("/webhook", { method: "POST" });
		expect(stripeRetry.status).toBe(200);
		expect(await stripeRetry.json()).toEqual({
			received: true,
			duplicate: true,
		});
		expect(processCounts.get(eventId)).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("webhookAck: worker in-flight 500s Stripe; after success Stripe retry does not reprocess")}`,
	async () => {
		await waitForRedisReady();
		const orgId = `org_replay_${randomUUID()}`;
		const eventId = `evt_${randomUUID()}`;
		const event = buildCheckoutEvent(eventId);
		let resolveProcessing!: () => void;
		workerHold.set(
			eventId,
			new Promise<void>((resolve) => {
				resolveProcessing = resolve;
			}),
		);

		const app = createWebhookApp({
			orgId,
			event,
			handler: () => {
				bumpProcess(eventId);
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		});

		const workerRun = replay({ orgId, event });
		await waitForCondition({
			condition: async () =>
				(await getMiscRedis().get(redisKeyFor({ orgId, eventId }))) ===
				"processing",
			description: "worker to acquire the processing lock",
		});

		const inFlight = await app.request("/webhook", { method: "POST" });
		expect(inFlight.status).toBe(500);
		expect(await inFlight.json()).toEqual({
			received: false,
			in_flight: true,
		});
		expect(processCounts.get(eventId) ?? 0).toBe(0);

		resolveProcessing();
		await workerRun;
		expect(processCounts.get(eventId)).toBe(1);

		const stripeRetry = await app.request("/webhook", { method: "POST" });
		expect(stripeRetry.status).toBe(200);
		expect(await stripeRetry.json()).toEqual({
			received: true,
			duplicate: true,
		});
		expect(processCounts.get(eventId)).toBe(1);
	},
);

afterAll(() => {
	process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL = originalReplayQueueUrl;
});
