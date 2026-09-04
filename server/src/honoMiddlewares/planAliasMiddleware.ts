import type { Context, Next } from "hono";
import { replaceJsonBody } from "@/honoUtils/forceJsonBody.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { rewritePlanIdAliasParams } from "@/internal/catalogV2/productAliases/rewritePlanIdAliasParams.js";
import { rewritePlanIdAliasValues } from "@/internal/catalogV2/productAliases/rewritePlanIdAliasValues.js";

const CREATE_PLAN_ID_SKIP_KEYS = new Set(["plan_id", "id", "product_id"]);

const isCreatePlanRoute = ({
	method,
	path,
}: {
	method: string;
	path: string;
}): boolean => {
	if (method !== "POST") return false;
	const pathname = (path.split("?")[0] ?? path).replace(/^\/v1/, "");
	return (
		pathname === "/products" ||
		pathname === "/plans" ||
		pathname.endsWith("/plans.create")
	);
};

/** `plans[]` and nested `variants[]` entries carrying internal_id, with the plan_id they stated. */
const statedPlanIdsByInternalId = (
	body: object,
): { entry: { plan_id?: unknown }; planId: unknown }[] => {
	const plans = (body as { plans?: unknown }).plans;
	if (!Array.isArray(plans)) return [];
	const stated: { entry: { plan_id?: unknown }; planId: unknown }[] = [];
	for (const plan of plans) {
		if (plan === null || typeof plan !== "object") continue;
		const entry = plan as {
			internal_id?: unknown;
			plan_id?: unknown;
			variants?: unknown;
		};
		if (typeof entry.internal_id === "string")
			stated.push({ entry, planId: entry.plan_id });
		if (!Array.isArray(entry.variants)) continue;
		for (const variant of entry.variants) {
			if (variant === null || typeof variant !== "object") continue;
			const nested = variant as {
				internal_id?: unknown;
				variant_plan_id?: unknown;
			};
			if (typeof nested.internal_id === "string")
				stated.push({
					entry: nested as unknown as { plan_id?: unknown },
					planId: nested.variant_plan_id,
				});
		}
	}
	return stated;
};

const isCatalogWriteRoute = ({ path }: { path: string }): boolean => {
	const pathname = (path.split("?")[0] ?? path).replace(/^\/v1/, "");
	return pathname.startsWith("/catalogV2.");
};

/**
 * Rewrites public plan ids in the JSON body and in `:product_id` path params.
 * Dashboard is skipped (it always sends canonical ids). Empty alias maps are a no-op.
 */
export const planAliasMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	if (c.req.header("x-client-type") === "dashboard") {
		await next();
		return;
	}

	const ctx = c.get("ctx");
	const aliases = ctx.org?.planAliases;
	if (!aliases || Object.keys(aliases).length === 0) {
		await next();
		return;
	}

	// Own-property shadows param(); same trick as queryMiddleware.
	// @ts-expect-error HonoRequest.param is a prototype method
	c.req.param = rewritePlanIdAliasParams({
		param: c.req.param.bind(c.req),
		aliases,
	});

	if (c.req.method === "GET" || c.req.method === "HEAD") {
		await next();
		return;
	}

	const body = ctx.requestBody;
	if (!body || typeof body !== "object") {
		await next();
		return;
	}

	const before = JSON.stringify(body);
	// A row addressed by internal_id states its desired plan_id (a reclaim
	// rename names the alias on purpose), so that one field is kept as sent.
	const statedIds = isCatalogWriteRoute({ path: c.req.path })
		? statedPlanIdsByInternalId(body)
		: [];
	rewritePlanIdAliasValues({
		value: body,
		aliases,
		skipKeys: isCreatePlanRoute({ method: c.req.method, path: c.req.path })
			? CREATE_PLAN_ID_SKIP_KEYS
			: undefined,
	});
	for (const { entry, planId } of statedIds) entry.plan_id = planId;
	// Skip replaceJsonBody on a no-op rewrite so bodyCache.text stays the
	// original bytes (Vercel HMAC runs captureRawBody after this middleware).
	if (before !== JSON.stringify(body)) {
		ctx.requestBody = body;
		await replaceJsonBody(c, body);
	}
	await next();
};
