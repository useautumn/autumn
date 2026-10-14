import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { invalidateOrgCatalog } from "@/internal/catalog/actions/invalidateOrgCatalog.js";
import { matchRoute } from "./middlewareUtils.js";

const productRoutes = [
	{ method: "POST", url: "/products" },
	{ method: "POST", url: "/products/:product_id" },
	{ method: "PATCH", url: "/products/:product_id" },
	{ method: "DELETE", url: "/products/:product_id" },

	{ method: "POST", url: "/plans" },
	{ method: "POST", url: "/plans/:plan_id" },
	{ method: "PATCH", url: "/plans/:plan_id" },
	{ method: "DELETE", url: "/plans/:plan_id" },

	{ method: "POST", url: "/plans.create" },
	{ method: "POST", url: "/plans.create_variant" },
	{ method: "POST", url: "/plans.update" },
	{ method: "POST", url: "/plans.delete" },

	{ method: "POST", url: "/catalog.update" },
	{ method: "POST", url: "/catalogV2.update" },

	{ method: "POST", url: "/features" },
	{ method: "POST", url: "/features/:feature_id" },
	{ method: "DELETE", url: "/features/:feature_id" },
	{ method: "POST", url: "/features.create" },
	{ method: "POST", url: "/features.update" },
	{ method: "POST", url: "/features.delete" },
];

export const refreshProductsCacheMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	await next();

	const ctx = c.get("ctx");

	if (ctx.testOptions?.skipCacheDeletion) return;

	const pathname = new URL(c.req.url).pathname.replace("/v1", "");
	const method = c.req.method;

	const match = productRoutes.find((pattern) =>
		matchRoute({ url: pathname, method, pattern }),
	);

	if (!match) return;

	await invalidateOrgCatalog({ ctx, orgId: ctx.org.id, env: ctx.env });
};
