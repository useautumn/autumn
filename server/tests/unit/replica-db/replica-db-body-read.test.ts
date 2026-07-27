/**
 * Guards the one integration risk in body-aware replica routing: the routing
 * decision reads the request body in middleware, and the route's zod validator
 * reads it again downstream. Hono caches the parsed body, so both see it — this
 * pins that behaviour against the real validator and the real route schema
 * rather than trusting the framework note.
 *
 * Contract under test:
 *   - A customer-scoped entities.list body routes to the primary AND still
 *     arrives intact at c.req.valid("json").
 *   - An unscoped body routes to the replica AND still arrives intact.
 *   - A malformed body routes to the primary and leaves the validator's own
 *     empty-body fallback untouched.
 */

import { describe, expect, test } from "bun:test";
import { ListEntitiesV2_3ParamsSchema } from "@autumn/shared";
import { Hono } from "hono";
import { validator } from "@/honoMiddlewares/validatorMiddleware.js";
import { shouldUseReplicaDb } from "@/internal/misc/replicaDb/replicaDbConfigs.js";

const buildApp = () => {
	const decisions: boolean[] = [];

	const app = new Hono();

	app.use("*", async (c, next) => {
		decisions.push(
			await shouldUseReplicaDb({
				method: c.req.method,
				path: c.req.path,
				readBody: () => c.req.json(),
			}),
		);
		await next();
	});

	// validatorMiddleware's json branch is untyped, so Hono can't widen
	// c.req.valid to accept "json" the way a zValidator route would.
	type ValidatedJsonRequest = {
		valid: (target: "json") => Record<string, unknown>;
	};

	app.post(
		"/v1/entities.list",
		validator("json", ListEntitiesV2_3ParamsSchema),
		(c) =>
			c.json({
				received: (c.req as unknown as ValidatedJsonRequest).valid("json"),
			}),
	);

	return { app, decisions };
};

const post = (app: Hono, body: string) =>
	app.request("/v1/entities.list", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});

describe("replica routing body read", () => {
	test("customer-scoped body picks the primary and still reaches the validator", async () => {
		const { app, decisions } = buildApp();

		const res = await post(
			app,
			JSON.stringify({ customer_id: "cus_123", limit: 5 }),
		);
		const json = (await res.json()) as { received: Record<string, unknown> };

		expect(res.status).toBe(200);
		expect(decisions).toEqual([false]);
		expect(json.received).toMatchObject({ customer_id: "cus_123", limit: 5 });
	});

	test("unscoped body picks the replica and still reaches the validator", async () => {
		const { app, decisions } = buildApp();

		const res = await post(app, JSON.stringify({ limit: 5, search: "acme" }));
		const json = (await res.json()) as { received: Record<string, unknown> };

		expect(res.status).toBe(200);
		expect(decisions).toEqual([true]);
		expect(json.received).toMatchObject({ limit: 5, search: "acme" });
	});

	test("malformed body picks the primary and leaves the validator fallback intact", async () => {
		const { app, decisions } = buildApp();

		const res = await post(app, "{not json");

		expect(decisions).toEqual([false]);
		// validatorMiddleware treats an unparseable body as {}, which this schema
		// accepts because every field is optional.
		expect(res.status).toBe(200);
	});
});
