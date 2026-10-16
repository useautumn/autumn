import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { dirname } from "node:path";
import { ErrCode, RecaseError } from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	allowed: true,
	throws: false,
	checks: [] as Record<string, unknown>[],
};

// Billing pins its own autumn-js, so mock the copy it imports, not server's.
const billingAutumnJs = Bun.resolveSync(
	"autumn-js",
	dirname(Bun.resolveSync("@autumn/billing", import.meta.dir)),
);

await mockModuleWithRestore(billingAutumnJs, () => ({
	Autumn: class {
		async check(args: Record<string, unknown>) {
			state.checks.push(args);
			if (state.throws) throw new Error("autumn unreachable");
			return { allowed: state.allowed };
		}
	},
}));

const { byocRpcRouter } = await import("@/internal/byoc/byocRouter.js");
const { billingFeatureMiddleware } = await import(
	"@/honoMiddlewares/billingFeatureMiddleware.js"
);
const { BillingFeatureId } = await import("@autumn/billing");
const atomsGate = billingFeatureMiddleware({
	featureId: BillingFeatureId.Atoms,
	featureName: "Atom",
});

const testCtx = ({ atoms }: { atoms?: boolean } = {}) =>
	({
		org: { id: "org_1" },
		logger: { warn: () => {}, info: () => {}, error: () => {} },
		testOptions: {
			billingFeatures: atoms === undefined ? undefined : { atoms },
		},
	}) as unknown as AutumnContext;

/** The rpc router's shape: byoc mounted at "", another rpc route after it. */
const rpcApp = ({ ctx }: { ctx: AutumnContext }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.post("/byoc.ping", atomsGate, (c) => c.json({ ok: true }));
	app.route("", byocRpcRouter);
	app.post("/stripe.read", (c) => c.json({ ok: true }));
	app.onError((error, c) =>
		c.json(
			{ code: error instanceof RecaseError ? error.code : "unexpected" },
			403,
		),
	);
	return app;
};

const post = async ({ ctx, path }: { ctx: AutumnContext; path: string }) => {
	const res = await rpcApp({ ctx }).request(path, { method: "POST" });
	return { status: res.status, body: await res.json() };
};

const savedEnv = { ...process.env };

/** Production in us-east-2, the one place the plan decides; a stack's .env.local would otherwise say development. */
const runAsProduction = () => {
	process.env.NODE_ENV = "production";
	process.env.AWS_REGION = "us-east-2";
	delete process.env.STAGING_ENVIRONMENT;
};

beforeEach(() => {
	state.allowed = true;
	state.throws = false;
	state.checks = [];
	runAsProduction();
});

afterAll(() => {
	for (const key of ["NODE_ENV", "AWS_REGION", "STAGING_ENVIRONMENT"])
		if (savedEnv[key] === undefined) delete process.env[key];
		else process.env[key] = savedEnv[key];
});

describe("billingFeatureMiddleware (atoms gate on byoc.* routes)", () => {
	test("refuses a byoc call with feature_limit_reached when the org lacks atoms", async () => {
		state.allowed = false;

		const res = await post({ ctx: testCtx(), path: "/byoc.get_atom" });

		expect(res).toEqual({
			status: 403,
			body: { code: ErrCode.FeatureLimitReached },
		});
		expect(state.checks).toEqual([{ customerId: "org_1", featureId: "atoms" }]);
	});

	test("lets a byoc call through when the org has atoms", async () => {
		const res = await post({ ctx: testCtx(), path: "/byoc.ping" });

		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(state.checks).toEqual([{ customerId: "org_1", featureId: "atoms" }]);
	});

	test("leaves rpc routes mounted after byoc ungated", async () => {
		state.allowed = false;

		const res = await post({ ctx: testCtx(), path: "/stripe.read" });

		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(state.checks).toEqual([]);
	});

	test("the x-billing-features override stands in for Autumn's check", async () => {
		const denied = await post({
			ctx: testCtx({ atoms: false }),
			path: "/byoc.delete_atom",
		});
		state.allowed = false;
		const allowed = await post({
			ctx: testCtx({ atoms: true }),
			path: "/byoc.ping",
		});

		expect(denied.body).toEqual({ code: ErrCode.FeatureLimitReached });
		expect(allowed).toEqual({ status: 200, body: { ok: true } });
		expect(state.checks).toEqual([]);
	});

	test("lets the call through on staging, without calling Autumn", async () => {
		process.env.STAGING_ENVIRONMENT = "true";
		process.env.AWS_REGION = "us-east-1";
		state.allowed = false;

		const res = await post({ ctx: testCtx(), path: "/byoc.ping" });

		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(state.checks).toEqual([]);
	});

	test("lets the call through on the local dev server, without calling Autumn", async () => {
		process.env.NODE_ENV = "development";
		state.allowed = false;

		const res = await post({ ctx: testCtx(), path: "/byoc.ping" });

		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(state.checks).toEqual([]);
	});

	test("fails open when the Autumn check throws", async () => {
		state.throws = true;

		const res = await post({ ctx: testCtx(), path: "/byoc.ping" });

		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(state.checks).toHaveLength(1);
	});
});
