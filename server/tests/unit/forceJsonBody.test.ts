import { expect, test } from "bun:test";
import { Hono } from "hono";
import { forceJsonBodyField } from "@/honoUtils/forceJsonBody.js";

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
