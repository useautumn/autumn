import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	errorMiddleware,
	errorToResponse,
} from "@/honoMiddlewares/errorMiddleware/errorMiddleware.js";
import {
	createListReadMiddleware,
	isListRoute,
} from "@/honoMiddlewares/listReadMiddleware.js";
import type { HonoEnv, RequestContext } from "@/honoUtils/HonoEnv.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const generalDb = { name: "general" } as unknown as DrizzleCli;
const listDb = { name: "list" } as unknown as DrizzleCli;
const replicaDb = { name: "replica" } as unknown as DrizzleCli;

type Scenario = {
	onReplica?: boolean;
	handler?: (ctx: RequestContext) => Promise<unknown>;
	logger?: {
		warn: (message: string) => void;
		error: (message: string) => void;
	};
};

const buildApp = ({ onReplica = false, handler, logger }: Scenario = {}) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			db: onReplica ? replicaDb : generalDb,
			useReplicaDb: onReplica,
			env: "sandbox",
			logger,
		} as unknown as RequestContext);
		await next();
	});
	app.use("*", createListReadMiddleware({ listDb, timeoutMs: 50 }));
	const answer = async (c: {
		get(key: "ctx"): RequestContext;
		json(body: unknown): Response;
	}) => {
		const ctx = c.get("ctx");
		await handler?.(ctx);
		return c.json({ db: (ctx.db as unknown as { name: string }).name });
	};
	app.post("/v1/entities.list", answer);
	app.post("/v1/entities.get", answer);
	app.onError((error, c) =>
		logger
			? errorMiddleware(error, c)
			: errorToResponse({ c, error, env: "sandbox" as never }),
	);
	return app;
};

const post = (app: Hono<HonoEnv>, path: string) =>
	app.request(path, { method: "POST" });

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

describe("listReadMiddleware", () => {
	test("list routes run on the list pool", async () => {
		const res = await post(buildApp(), "/v1/entities.list");
		expect(await res.json()).toEqual({ db: "list" });
	});

	test("a list route the replica lane already claimed stays on the replica", async () => {
		const res = await post(buildApp({ onReplica: true }), "/v1/entities.list");
		expect(await res.json()).toEqual({ db: "replica" });
	});

	test("other routes keep their pool and never see the deadline", async () => {
		const res = await post(
			buildApp({ handler: () => sleep(100) }),
			"/v1/entities.get",
		);
		expect(await res.json()).toEqual({ db: "general" });
	});

	test("a list read past the deadline answers 504 request_timeout", async () => {
		const startedAt = performance.now();
		const res = await post(
			buildApp({ handler: () => sleep(500) }),
			"/v1/entities.list",
		);
		expect(performance.now() - startedAt).toBeLessThan(400);
		expect(res.status).toBe(504);
		expect(((await res.json()) as { code: string }).code).toBe(
			"request_timeout",
		);
	});

	test("a DB read that rejects after the deadline is a warning, not a second error report", async () => {
		const warnings: string[] = [];
		const errors: string[] = [];
		const res = await post(
			buildApp({
				logger: { warn: (m) => warnings.push(m), error: (m) => errors.push(m) },
				handler: async () => {
					await sleep(200);
					throw new Error("Query read timeout");
				},
			}),
			"/v1/entities.list",
		);
		expect(res.status).toBe(504);
		await sleep(250);
		expect(
			warnings.some((m) => m.includes("after its response was sent")),
		).toBe(true);
		expect(errors.filter((m) => m.includes("Query read timeout"))).toHaveLength(
			0,
		);
	});

	test("other handler errors pass through untouched", async () => {
		const res = await post(
			buildApp({
				handler: async () => {
					throw new Error("boom");
				},
			}),
			"/v1/entities.list",
		);
		expect(res.status).toBe(500);
	});
});
