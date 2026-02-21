import { AppEnv, AuthType } from "@autumn/shared";
import type { NextFunction } from "express";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	getMockOrgContext,
	MOCK_ORG_ID,
} from "@/utils/mockMode/initMockOrg.js";

/**
 * Mock auth middleware for Express routes (MOCK_MODE=true only).
 *
 * Bypasses all API key and session validation. Looks up the real mock org
 * from the DB (populated on startup by initMockOrg) and injects it into
 * req so all downstream handlers work normally against a real DB / Stripe sandbox.
 */
export const mockAuthMiddleware = async (
	req: any,
	res: any,
	next: NextFunction,
) => {
	let mockData = getMockOrgContext();

	if (!mockData) {
		const appEnv = (req.headers.app_env as AppEnv) ?? AppEnv.Sandbox;
		mockData = await OrgService.getWithFeatures({
			db: req.db,
			orgId: MOCK_ORG_ID,
			env: appEnv,
			allowNotFound: true,
		});
	}

	if (!mockData) {
		return res.status(503).json({
			message: "Mock org not initialised yet — server may still be starting up",
			code: "mock_org_not_ready",
		});
	}

	const appEnv = (req.headers.app_env as AppEnv) ?? AppEnv.Sandbox;

	req.orgId = mockData.org.id;
	req.env = appEnv;
	req.org = mockData.org;
	req.features = mockData.features;
	req.authType = AuthType.SecretKey;
	req.userId = "mock_test_user";

	next();
};
