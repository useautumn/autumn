import { describe, expect, it } from "bun:test";
import { Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { createRoute, raceFailOpen } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const response = (label: string) => new Response(label);

describe("raceFailOpen", () => {
	it("returns the handler response when it beats the timer", async () => {
		const result = await raceFailOpen({
			run: async () => response("handler"),
			timeoutMs: 1_000,
			respond: () => response("fail-open"),
		});

		expect(await result.text()).toBe("handler");
	});

	it("returns the fail-open response when the handler is too slow", async () => {
		const result = await raceFailOpen({
			run: async () => {
				await Bun.sleep(200);
				return response("handler");
			},
			timeoutMs: 20,
			respond: () => response("fail-open"),
		});

		expect(await result.text()).toBe("fail-open");
	});

	it("a slow handler that later rejects does not crash the process", async () => {
		let settled = false;
		const result = await raceFailOpen({
			run: async () => {
				await Bun.sleep(50);
				settled = true;
				throw new Error("late failure after fail-open already responded");
			},
			timeoutMs: 10,
			respond: () => response("fail-open"),
		});

		expect(await result.text()).toBe("fail-open");
		// Let the abandoned run settle; an unhandled rejection would fail the suite.
		await Bun.sleep(80);
		expect(settled).toBe(true);
	});

	it("a fast rejection propagates instead of failing open", async () => {
		await expect(
			raceFailOpen({
				run: async () => {
					throw new Error("real error");
				},
				timeoutMs: 1_000,
				respond: () => response("fail-open"),
			}),
		).rejects.toThrow("real error");
	});

	it("a synchronously throwing respond rejects the race instead of hanging", async () => {
		await expect(
			raceFailOpen({
				run: async () => {
					await Bun.sleep(100);
					return response("handler");
				},
				timeoutMs: 10,
				respond: () => {
					throw new Error("respond blew up");
				},
			}),
		).rejects.toThrow("respond blew up");
	});

	it("an async-rejecting respond also rejects the race", async () => {
		await expect(
			raceFailOpen({
				run: async () => {
					await Bun.sleep(100);
					return response("handler");
				},
				timeoutMs: 10,
				respond: async () => {
					throw new Error("async respond failure");
				},
			}),
		).rejects.toThrow("async respond failure");
	});
});

describe("createRoute failOpen skip", () => {
	// Mounted under /webhooks/ so the scope-check middleware self-bypasses and
	// only the request timestamp is needed in ctx.
	const buildApp = ({
		skip,
		requestStartedAt = Date.now(),
		handlerDelayMs = 60,
	}: {
		skip: () => boolean;
		requestStartedAt?: number;
		handlerDelayMs?: number;
	}) => {
		const app = new Hono<HonoEnv>();
		app.use("*", async (c, next) => {
			c.set("ctx", {
				timestamp: requestStartedAt,
			} as HonoEnv["Variables"]["ctx"]);
			await next();
		});
		app.post(
			"/webhooks/fail-open-test",
			...createRoute({
				scopes: [Scopes.Public],
				failOpen: {
					timeoutMs: 20,
					skip,
					respond: () => response("fail-open"),
				},
				handler: async () => {
					await Bun.sleep(handlerDelayMs);
					return response("handler");
				},
			}),
		);
		return app;
	};

	it("skip=true runs the handler unraced even when it exceeds the timeout", async () => {
		const app = buildApp({ skip: () => true });
		const result = await app.request("/webhooks/fail-open-test", {
			method: "POST",
		});
		expect(await result.text()).toBe("handler");
	});

	it("skip=false still races and fails open when the handler is slow", async () => {
		const app = buildApp({ skip: () => false });
		const result = await app.request("/webhooks/fail-open-test", {
			method: "POST",
		});
		expect(await result.text()).toBe("fail-open");
	});

	it("counts time elapsed before the handler against the timeout", async () => {
		const app = buildApp({
			skip: () => false,
			requestStartedAt: Date.now() - 100,
			handlerDelayMs: 0,
		});
		const result = await app.request("/webhooks/fail-open-test", {
			method: "POST",
		});
		expect(await result.text()).toBe("fail-open");
	});
});
