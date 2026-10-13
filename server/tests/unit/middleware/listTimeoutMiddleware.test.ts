import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { errorToResponse } from "@/honoMiddlewares/errorMiddleware/errorMiddleware.js";
import {
	createListTimeoutMiddleware,
	isListRoute,
} from "@/honoMiddlewares/listTimeoutMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const buildApp = () => {
	const app = new Hono<HonoEnv>();
	app.use("*", createListTimeoutMiddleware({ timeoutMs: 50 }));
	app.get("/v1/customers", async (c) => {
		await sleep(Number(c.req.query("delay") ?? 0));
		return c.json({ list: [] });
	});
	app.post("/v1/customers.get", async (c) => {
		await sleep(100);
		return c.json({ ok: true });
	});
	app.onError((error, c) =>
		errorToResponse({ c, error, env: "sandbox" as never }),
	);
	return app;
};

describe("isListRoute", () => {
	test("matches paged list reads only", () => {
		expect(isListRoute({ method: "GET", path: "/v1/customers" })).toBe(true);
		expect(isListRoute({ method: "POST", path: "/v1/entities.list" })).toBe(
			true,
		);
		expect(
			isListRoute({ method: "POST", path: "/customers/all/full_customers" }),
		).toBe(true);
		expect(isListRoute({ method: "POST", path: "/v1/customers" })).toBe(false);
		expect(isListRoute({ method: "GET", path: "/v1/customers/cus_1" })).toBe(
			false,
		);
		expect(isListRoute({ method: "POST", path: "/v1/plans.list" })).toBe(false);
	});
});

describe("listTimeoutMiddleware", () => {
	test("answers 504 request_timeout when a list read passes the deadline", async () => {
		const res = await buildApp().request("/v1/customers?delay=200");
		expect(res.status).toBe(504);
		expect(((await res.json()) as { code: string }).code).toBe(
			"request_timeout",
		);
	});

	test("passes through list reads inside the deadline", async () => {
		const res = await buildApp().request("/v1/customers?delay=0");
		expect(res.status).toBe(200);
	});

	test("never bounds non-list routes", async () => {
		const res = await buildApp().request("/v1/customers.get", {
			method: "POST",
		});
		expect(res.status).toBe(200);
	});
});
