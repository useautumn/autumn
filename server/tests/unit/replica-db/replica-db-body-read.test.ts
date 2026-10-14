import { describe, expect, test } from "bun:test";
import { ListEntitiesV2_3ParamsSchema } from "@autumn/shared";
import { Hono } from "hono";
import { validator } from "@/honoMiddlewares/validatorMiddleware.js";
import {
	type ReplicaDbLane,
	resolveReplicaDbLane,
} from "@/internal/misc/replicaDb/replicaDbConfigs.js";

const buildApp = () => {
	const decisions: Array<ReplicaDbLane | null> = [];

	const app = new Hono();

	app.use("*", async (c, next) => {
		decisions.push(
			await resolveReplicaDbLane({
				method: c.req.method,
				path: c.req.path,
				readBody: () => c.req.json(),
			}),
		);
		await next();
	});

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
		expect(decisions).toEqual([null]);
		expect(json.received).toMatchObject({ customer_id: "cus_123", limit: 5 });
	});

	test("unscoped body picks the replica and still reaches the validator", async () => {
		const { app, decisions } = buildApp();

		const res = await post(app, JSON.stringify({ limit: 5, search: "acme" }));
		const json = (await res.json()) as { received: Record<string, unknown> };

		expect(res.status).toBe(200);
		expect(decisions).toEqual(["default"]);
		expect(json.received).toMatchObject({ limit: 5, search: "acme" });
	});

	test("malformed body picks the primary and leaves the validator fallback intact", async () => {
		const { app, decisions } = buildApp();

		const res = await post(app, "{not json");

		expect(decisions).toEqual([null]);
		expect(res.status).toBe(200);
	});
});
