import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { stripeWebhookAckMiddleware } from "@/external/stripe/webhookMiddlewares/stripeWebhookAckMiddleware";

const waitForImmediate = () => new Promise((resolve) => setImmediate(resolve));

const createApp = () => {
	const app = new Hono();

	app.use("*", async (c, next) => {
		(c as any).set("ctx", {
			logger: {
				error: () => {},
			},
		});
		await next();
	});

	return app;
};

describe("stripeWebhookAckMiddleware", () => {
	test("uses executionCtx.waitUntil when the runtime provides it", async () => {
		const waits: Promise<unknown>[] = [];
		let processed = false;
		const response = await stripeWebhookAckMiddleware(
			{
				get: () => ({
					logger: { error: () => {} },
				}),
				json: (body: unknown, status: number) =>
					new Response(JSON.stringify(body), { status }),
				executionCtx: {
					waitUntil: (promise: Promise<unknown>) => waits.push(promise),
				},
			} as never,
			async () => {
				processed = true;
			},
		);

		if (!response) throw new Error("expected an early-ack response");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(waits).toHaveLength(1);

		await waits[0];
		expect(processed).toBe(true);
	});

	test("does not run downstream twice when waitUntil throws", async () => {
		const errors: unknown[] = [];
		let runs = 0;
		const response = await stripeWebhookAckMiddleware(
			{
				get: () => ({
					logger: {
						error: (_message: string, meta: unknown) => errors.push(meta),
					},
				}),
				json: (body: unknown, status: number) =>
					new Response(JSON.stringify(body), { status }),
				executionCtx: {
					waitUntil: () => {
						throw new Error("waitUntil failed");
					},
				},
			} as never,
			async () => {
				runs++;
			},
		);

		if (!response) throw new Error("expected an early-ack response");
		expect(response.status).toBe(200);
		await Promise.resolve();
		await waitForImmediate();
		expect(runs).toBe(1);
		expect(errors).toHaveLength(1);
	});

	test("returns 200 before downstream webhook processing completes", async () => {
		const app = createApp();
		let resolveProcessing!: () => void;
		let processed = false;
		const processing = new Promise<void>((resolve) => {
			resolveProcessing = resolve;
		});

		app.post("/webhook", stripeWebhookAckMiddleware as never, async (c) => {
			await processing;
			processed = true;
			return c.json({ processed: true }, 200);
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(processed).toBe(false);

		resolveProcessing();
		await waitForImmediate();
		expect(processed).toBe(true);
	});

	test("does not run downstream webhook processing before returning", async () => {
		const app = createApp();
		let started = false;

		app.post("/webhook", stripeWebhookAckMiddleware as never, (c) => {
			started = true;
			return c.json({ processed: true }, 200);
		});

		const response = await app.request("/webhook", { method: "POST" });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(started).toBe(false);

		await waitForImmediate();
		expect(started).toBe(true);
	});
});
