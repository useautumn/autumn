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

	// A catalog update states desired ids (a reclaim rename names the alias on
	// purpose), so its body is never rewritten through the alias map.
	if (isCatalogWriteRoute({ path: c.req.path })) {
		await next();
		return;
	}

	const before = JSON.stringify(body);
	rewritePlanIdAliasValues({
		value: body,
		aliases,
		skipKeys: isCreatePlanRoute({ method: c.req.method, path: c.req.path })
			? CREATE_PLAN_ID_SKIP_KEYS
			: undefined,
	});
	// Skip replaceJsonBody on a no-op rewrite so bodyCache.text stays the
	// original bytes (Vercel HMAC runs captureRawBody after this middleware).
	if (before !== JSON.stringify(body)) {
		ctx.requestBody = body;
		await replaceJsonBody(c, body);
	}
	await next();
};
