import { AppEnv } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const vercelSeederMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const { orgId, env } = c.req.param();
	const ctx = c.get("ctx");

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

	await next();
};
