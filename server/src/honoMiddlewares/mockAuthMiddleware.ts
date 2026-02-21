import { AppEnv, AuthType } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	getMockOrgContext,
	MOCK_ORG_ID,
} from "@/utils/mockMode/initMockOrg.js";

/**
 * Mock auth middleware for Hono routes (MOCK_MODE=true only).
 *
 * Bypasses all API key and session validation. Looks up the real mock org
 * from the DB (populated on startup by initMockOrg) and injects it into
 * the request context so all downstream handlers work normally against a
 * real DB / Stripe sandbox.
 *
 * The env defaults to Sandbox; callers may override via the app_env header.
 */
export const mockAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	// Prefer cached context; fall back to a fresh DB lookup if the cache
	// was not populated yet (e.g. first request before startup hook ran)
	let mockData = getMockOrgContext();

	if (!mockData) {
		const appEnv = (c.req.header("app_env") as AppEnv) ?? AppEnv.Sandbox;
		mockData = await OrgService.getWithFeatures({
			db: ctx.db,
			orgId: MOCK_ORG_ID,
			env: appEnv,
			allowNotFound: true,
		});
	}

	if (!mockData) {
		return c.json(
			{
				message:
					"Mock org not initialised yet — server may still be starting up",
				code: "mock_org_not_ready",
			},
			503,
		);
	}

	const appEnv = (c.req.header("app_env") as AppEnv) ?? AppEnv.Sandbox;

	ctx.org = mockData.org;
	ctx.features = mockData.features;
	ctx.env = appEnv;
	ctx.userId = "mock_test_user";
	ctx.authType = AuthType.SecretKey;

	await next();
};
