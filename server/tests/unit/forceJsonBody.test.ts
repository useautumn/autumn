import { expect, test } from "bun:test";
import { Hono } from "hono";
import { forceJsonBodyField, replaceJsonBody } from "@/honoUtils/forceJsonBody.js";

/**
 * Guards the one Hono-internal coupling in forceJsonBodyField. If a Hono upgrade
 * changes how the request body is cached, this fails loudly — instead of the
 * customer-JWT middleware silently failing to scope requests.
 */
test("forceJsonBodyField overrides a field seen by downstream c.req.json()", async () => {
	const app = new Hono();
	app.use("*", async (c, next) => {
		await forceJsonBodyField(c, "customer_id", "forced");
		await next();
	});
	app.post("/x", async (c) => c.json(await c.req.json()));

	const res = await app.request("/x", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ customer_id: "original", keep: 1 }),
	});
	const body = (await res.json()) as { customer_id: string; keep: number };

	expect(body.customer_id).toBe("forced");
	expect(body.keep).toBe(1);
});

test("replaceJsonBody replaces the body seen by downstream c.req.json()", async () => {
	const app = new Hono();
	app.use("*", async (c, next) => {
		await replaceJsonBody(c, { customer_id: "rewritten", keep: 1 });
		await next();
	});
	app.post("/x", async (c) => c.json(await c.req.json()));

	const res = await app.request("/x", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ customer_id: "original" }),
	});
	const body = (await res.json()) as { customer_id: string; keep: number };

	expect(body.customer_id).toBe("rewritten");
	expect(body.keep).toBe(1);
});

test("replaceJsonBody resets bodyCache to { text } so json() re-parses", async () => {
	const seen: { keys?: string[]; text?: string } = {};
	const app = new Hono();
	app.use("*", async (c, next) => {
		await c.req.json();
		await replaceJsonBody(c, { plan_id: "proNew" });
		const bodyCache = (c.req as { bodyCache: Record<string, unknown> })
			.bodyCache;
		seen.keys = Object.keys(bodyCache);
		seen.text = await (bodyCache.text as Promise<string>);
		await next();
	});
	app.post("/x", async (c) => c.json(await c.req.json()));

	const res = await app.request("/x", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ plan_id: "pro" }),
	});

	expect(seen.keys).toEqual(["text"]);
	expect(seen.text).toBe(JSON.stringify({ plan_id: "proNew" }));
	expect(await res.json()).toEqual({ plan_id: "proNew" });
});
