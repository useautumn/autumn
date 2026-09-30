import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { ApiVersionClass, AppEnv, LATEST_VERSION } from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCheck } from "@/internal/api/check/handleCheck.js";
import * as balanceWorkerCheck from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";

// The worker lane is what this file covers; the rollout is turned on for it alone.
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";

afterAll(() => {
	// A spy outlives its file; left in place it throws in every later worker-check test on the shard.
	balanceWorkerCheckSpy.mockRestore();
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});
afterEach(() => {
	balanceWorkerCheckSpy.mockClear();
});

const balanceWorkerCheckSpy = spyOn(
	balanceWorkerCheck,
	"runBalanceWorkerCheck",
).mockImplementation(async () => {
	throw new Error("An org over its rate cap never reaches the worker");
});

const ignoreLog = () => {};

const createCtx = (): AutumnContext =>
	({
		id: "req_check_rate_cap",
		timestamp: Date.now(),
		org: { id: "org_rate_cap", slug: "rate-cap", config: {} },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [],
		extraLogs: {},
		scopes: [],
		expand: [],
		skipCache: false,
		orgRateLimitDegraded: true,
		logger: {
			info: ignoreLog,
			warn: ignoreLog,
			error: ignoreLog,
			debug: ignoreLog,
		},
	}) as unknown as AutumnContext;

const postCheck = (body: Record<string, unknown>) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", createCtx());
		await next();
	});
	app.post("/check", ...handleCheck);
	return app.request("/check", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
};

test("an org over its rate cap fails its worker check open with a 202, as legacy does", async () => {
	const response = await postCheck({
		customer_id: "cus_1",
		feature_id: "messages",
	});

	expect(response.status).toBe(202);
	expect(await response.json()).toMatchObject({ allowed: true });
	expect(balanceWorkerCheckSpy).not.toHaveBeenCalled();
});
