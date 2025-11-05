import { AppEnv } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getAuthorizationToken, verifyToken } from "./auth/vercelAuth.js";

export const vercelSeederMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const { orgId, env } = c.req.param();
	const ctx = c.get("ctx");
	const headers = c.req.header();
	console.log("Vercel webhook headers", JSON.stringify(headers, null, 4));

	console.log("Vercel Seeder Middleware: orgId", orgId);
	console.log("Vercel Seeder Middleware: env", env);

	console.log("Will skip org fetch?", !ctx.org && orgId);
	console.log("Will skip env fetch?", !ctx.env && env);
	console.log("Will skip features fetch?", !ctx.features && orgId);

	if (!ctx.org && orgId) {
		ctx.org = await OrgService.get({ db: ctx.db, orgId });
	}
	if (!ctx.env && env) {
		ctx.env = env as AppEnv;
	}
	if (!ctx.features && orgId) {
		ctx.features = await FeatureService.list({
			db: ctx.db,
			orgId,
			env: ctx.env ?? AppEnv.Sandbox,
		});
	}
	if (c.req.header("Authorization")) {
		const token = getAuthorizationToken(c.req.header() as unknown as Headers);
		const claims = await verifyToken(token);
		ctx.vercelClaims = claims;
	}

	await next();
};
