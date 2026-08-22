import { expect, test } from "bun:test";
import { Hono } from "hono";
import { planAliasMiddleware } from "@/honoMiddlewares/planAliasMiddleware.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { PLAN_ID_ALIAS_REWRITE_KEYS } from "@/internal/catalogV2/productAliases/planIdAliasRewriteKeys.js";
import { rewritePlanIdAliasParams } from "@/internal/catalogV2/productAliases/rewritePlanIdAliasParams.js";
import { rewritePlanIdAliasValues } from "@/internal/catalogV2/productAliases/rewritePlanIdAliasValues.js";

const ALIASES = { pro: "proNew", starter: "starterNew" };

const rewriteBody = <T extends Record<string, unknown>>({
	body,
	skipKeys,
}: {
	body: T;
	skipKeys?: Set<string>;
}): T => {
	rewritePlanIdAliasValues({ value: body, aliases: ALIASES, skipKeys });
	return body;
};

test("PLAN_ID_ALIAS_REWRITE_KEYS covers every public plan-id body field", () => {
	const expected = [
		"product_id",
		"product_ids",
		"plan_id",
		"plan_ids",
		"remove_plan_ids",
		"base_plan_id",
		"base_variant_id",
		"variant_plan_id",
		"license_plan_id",
		"auto_enable_plan_id",
		"free_product_id",
		"autumn_product_id",
		"skip_plan_ids",
		"update_variant_ids",
		"billingPlanId",
	];
	expect([...PLAN_ID_ALIAS_REWRITE_KEYS].sort()).toEqual(expected.sort());
});

test.each([
	["product_id", "pro", "proNew"],
	["product_ids", ["pro", "starter"], ["proNew", "starterNew"]],
	["plan_id", "pro", "proNew"],
	["plan_ids", ["pro"], ["proNew"]],
	["remove_plan_ids", ["pro"], ["proNew"]],
	["base_plan_id", "pro", "proNew"],
	["base_variant_id", "pro", "proNew"],
	["variant_plan_id", "pro", "proNew"],
	["license_plan_id", "pro", "proNew"],
	["auto_enable_plan_id", "pro", "proNew"],
	["free_product_id", "pro", "proNew"],
	["autumn_product_id", "pro", "proNew"],
	["skip_plan_ids", ["pro"], ["proNew"]],
	["update_variant_ids", ["pro"], ["proNew"]],
	["billingPlanId", "pro", "proNew"],
] as const)(
	"rewritePlanIdAliasValues rewrites top-level %s",
	(key, input, expected) => {
		const body = rewriteBody({
			body: { [key]: input } as Record<string, unknown>,
		});
		expect(body[key]).toEqual(expected);
	},
);

test("rewritePlanIdAliasValues rewrites nested objects and arrays", () => {
	const body = rewriteBody({
		body: {
			plans: [{ plan_id: "pro", propagate: { license_parents: [{ plan_id: "starter" }] } }],
			phases: [{ plans: [{ plan_id: "pro", license_quantities: [{ license_plan_id: "starter" }] }] }],
			customize: {
				upsert_licenses: [{ license_plan_id: "pro" }],
				remove_licenses: [{ license_plan_id: "starter" }],
			},
			remove_plans: [{ plan_id: "pro" }],
			mappings: [{ autumn_product_id: "pro", revenuecat_product_ids: ["rc_1"] }],
		},
	});

	expect(body.plans[0].plan_id).toBe("proNew");
	expect(body.plans[0].propagate.license_parents[0].plan_id).toBe("starterNew");
	expect(body.phases[0].plans[0].plan_id).toBe("proNew");
	expect(body.phases[0].plans[0].license_quantities[0].license_plan_id).toBe(
		"starterNew",
	);
	expect(body.customize.upsert_licenses[0].license_plan_id).toBe("proNew");
	expect(body.customize.remove_licenses[0].license_plan_id).toBe("starterNew");
	expect(body.remove_plans[0].plan_id).toBe("proNew");
	expect(body.mappings[0].autumn_product_id).toBe("proNew");
	expect(body.mappings[0].revenuecat_product_ids).toEqual(["rc_1"]);
});

test("rewritePlanIdAliasValues does not rewrite new_plan_id", () => {
	const body = rewriteBody({
		body: { plan_id: "pro", new_plan_id: "pro" },
	});
	expect(body.plan_id).toBe("proNew");
	expect(body.new_plan_id).toBe("pro");
});

test("rewritePlanIdAliasValues skipKeys leaves create identity fields untouched", () => {
	const skipKeys = new Set(["plan_id", "id", "product_id"]);
	const body = rewriteBody({
		body: {
			plan_id: "pro",
			id: "pro",
			product_id: "pro",
			license_plan_id: "pro",
		},
		skipKeys,
	});

	expect(body.plan_id).toBe("pro");
	expect(body.id).toBe("pro");
	expect(body.product_id).toBe("pro");
	expect(body.license_plan_id).toBe("proNew");
});

test("rewritePlanIdAliasValues is a no-op for empty alias map", () => {
	const body = { plan_id: "pro", product_id: "pro" };
	rewritePlanIdAliasValues({ value: body, aliases: {} });
	expect(body).toEqual({ plan_id: "pro", product_id: "pro" });
});

test("rewritePlanIdAliasValues ignores null, primitives, and missing body", () => {
	expect(rewritePlanIdAliasValues({ value: null, aliases: ALIASES })).toBe(null);
	expect(rewritePlanIdAliasValues({ value: "pro", aliases: ALIASES })).toBe("pro");
	expect(rewritePlanIdAliasValues({ value: undefined, aliases: ALIASES })).toBe(
		undefined,
	);
});

test("rewritePlanIdAliasParams rewrites product_id and productId, not customer_id", () => {
	const param = ((key?: string) => {
		const all = { product_id: "pro", productId: "pro", customer_id: "pro" };
		return key ? all[key as keyof typeof all] : all;
	}) as Parameters<typeof rewritePlanIdAliasParams>[0]["param"];

	const rewritten = rewritePlanIdAliasParams({ param, aliases: ALIASES });

	expect(rewritten("product_id")).toBe("proNew");
	expect(rewritten("productId")).toBe("proNew");
	expect(rewritten("customer_id")).toBe("pro");
	expect(rewritten()).toEqual({
		product_id: "proNew",
		productId: "proNew",
		customer_id: "pro",
	});
});

test("wrapped c.req.param is what a later :product_id handler sees", async () => {
	const app = new Hono();
	app.use("*", async (c, next) => {
		// @ts-expect-error prototype method
		c.req.param = rewritePlanIdAliasParams({
			param: c.req.param.bind(c.req),
			aliases: ALIASES,
		});
		await next();
	});
	app.get("/products/:product_id", (c) =>
		c.json({
			byKey: c.req.param("product_id"),
			all: c.req.param().product_id,
		}),
	);

	const res = await app.request("/products/pro");
	expect(await res.json()).toEqual({ byKey: "proNew", all: "proNew" });
});

const mountPlanAliasHarness = ({
	clientType,
	method,
	path,
	body,
	route = "*",
	org = { planAliases: ALIASES },
	rawBody,
	contentType = "application/json",
}: {
	clientType?: string;
	method: string;
	path: string;
	body?: unknown;
	route?: string;
	org?: { planAliases?: Record<string, string> } | null;
	rawBody?: string;
	contentType?: string;
}) => {
	const seen: {
		body?: unknown;
		productId?: string;
		json?: unknown;
		text?: string;
		bodyCacheKeys?: string[];
	} = {};
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			org,
			requestBody: body,
		} as unknown as AutumnContext);
		await next();
	});
	app.use("*", planAliasMiddleware);
	app.all(route, async (c) => {
		seen.body = c.get("ctx").requestBody;
		seen.productId = c.req.param("product_id");
		seen.bodyCacheKeys = Object.keys(
			(c.req as { bodyCache: Record<string, unknown> }).bodyCache,
		);
		try {
			seen.json = await c.req.json();
		} catch {
			seen.json = undefined;
		}
		try {
			seen.text = await c.req.text();
		} catch {
			seen.text = undefined;
		}
		return c.json({ ok: true });
	});

	const headers: Record<string, string> = {};
	if (clientType) headers["x-client-type"] = clientType;

	const init: RequestInit = { method, headers };
	const hasHttpBody =
		rawBody !== undefined ||
		(body !== undefined && method !== "GET" && method !== "HEAD");
	if (hasHttpBody) {
		init.body = rawBody ?? JSON.stringify(body);
		init.headers = { ...headers, "Content-Type": contentType };
	}

	return {
		request: () => app.request(path, init),
		seen,
	};
};

test("planAliasMiddleware skips dashboard clients", async () => {
	const { request, seen } = mountPlanAliasHarness({
		clientType: "dashboard",
		method: "POST",
		path: "/products/pro",
		route: "/products/:product_id",
		body: { plan_id: "pro" },
	});
	await request();
	expect(seen.productId).toBe("pro");
	expect(seen.body).toEqual({ plan_id: "pro" });
});

test("planAliasMiddleware skips GET bodies but still rewrites path params", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "GET",
		path: "/products/pro",
		route: "/products/:product_id",
		body: { plan_id: "pro" },
	});
	await request();
	expect(seen.productId).toBe("proNew");
	expect(seen.body).toEqual({ plan_id: "pro" });
});

test("planAliasMiddleware does not invent a body when requestBody is missing", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "POST",
		path: "/billing.attach",
		body: undefined,
	});
	await request();
	expect(seen.body).toBeUndefined();
});

test("planAliasMiddleware skips create-plan identity keys on POST /plans", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "POST",
		path: "/v1/plans",
		body: {
			plan_id: "pro",
			id: "pro",
			product_id: "pro",
			license_plan_id: "pro",
		},
	});
	await request();
	expect(seen.body).toEqual({
		plan_id: "pro",
		id: "pro",
		product_id: "pro",
		license_plan_id: "proNew",
	});
});

test("planAliasMiddleware skips create-plan identity keys on POST /plans.create", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "POST",
		path: "/plans.create",
		body: { plan_id: "pro", name: "Pro" },
	});
	await request();
	expect(seen.body).toEqual({ plan_id: "pro", name: "Pro" });
});

test("planAliasMiddleware rewrites billing bodies on non-create routes", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "POST",
		path: "/billing.attach",
		body: {
			customer_id: "cus_1",
			plan_id: "pro",
			remove_plan_ids: ["starter"],
			new_plan_id: "pro",
		},
	});
	await request();
	expect(seen.body).toEqual({
		customer_id: "cus_1",
		plan_id: "proNew",
		remove_plan_ids: ["starterNew"],
		new_plan_id: "pro",
	});
	expect(seen.json).toEqual(seen.body);
});

test("planAliasMiddleware skips HEAD bodies but still rewrites path params", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "HEAD",
		path: "/products/pro",
		route: "/products/:product_id",
		body: { plan_id: "pro" },
	});
	await request();
	expect(seen.productId).toBe("proNew");
	expect(seen.body).toEqual({ plan_id: "pro" });
});

test("planAliasMiddleware does not invent a body for empty object or non-object", async () => {
	const empty = mountPlanAliasHarness({
		method: "POST",
		path: "/billing.attach",
		body: {},
	});
	await empty.request();
	expect(empty.seen.body).toEqual({});

	const primitive = mountPlanAliasHarness({
		method: "POST",
		path: "/billing.attach",
		body: "pro",
	});
	await primitive.request();
	expect(primitive.seen.body).toBe("pro");
});

test("planAliasMiddleware no-op rewrite keeps original bodyCache.text", async () => {
	const pretty = '{\n  "keep": 1,\n  "type": "marketplace.invoice.created"\n}';
	const { request, seen } = mountPlanAliasHarness({
		method: "POST",
		path: "/webhooks/vercel/org_1/sandbox/marketplace",
		body: { keep: 1, type: "marketplace.invoice.created" },
		rawBody: pretty,
	});
	await request();
	expect(seen.body).toEqual({ keep: 1, type: "marketplace.invoice.created" });
	expect(seen.text).toBe(pretty);
	expect(seen.json).toEqual({ keep: 1, type: "marketplace.invoice.created" });
});

test("planAliasMiddleware is a no-op when org or alias map is missing", async () => {
	const noOrg = mountPlanAliasHarness({
		method: "POST",
		path: "/products/pro",
		route: "/products/:product_id",
		body: { plan_id: "pro" },
		org: null,
	});
	await noOrg.request();
	expect(noOrg.seen.productId).toBe("pro");
	expect(noOrg.seen.body).toEqual({ plan_id: "pro" });

	const emptyMap = mountPlanAliasHarness({
		method: "POST",
		path: "/products/pro",
		route: "/products/:product_id",
		body: { plan_id: "pro" },
		org: { planAliases: {} },
	});
	await emptyMap.request();
	expect(emptyMap.seen.productId).toBe("pro");
	expect(emptyMap.seen.body).toEqual({ plan_id: "pro" });
});

test("planAliasMiddleware does not replace a non-JSON content type", async () => {
	const { request, seen } = mountPlanAliasHarness({
		method: "POST",
		path: "/billing.attach",
		body: undefined,
		rawBody: "plan_id=pro",
		contentType: "application/x-www-form-urlencoded",
	});
	await request();
	expect(seen.body).toBeUndefined();
	expect(seen.text).toBe("plan_id=pro");
});
