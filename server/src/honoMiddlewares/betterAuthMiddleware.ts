import { type AppEnv, AuthType, ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";

/**
 * Better Auth middleware for dashboard/session authentication
 * Replicates withOrgAuth from Express authMiddleware.ts
 *
 * Steps:
 * 1. Get session from Better Auth
 * 2. Validate session exists
 * 3. Extract orgId and userId
 * 4. Fetch org and features from database
 * 5. Store in context
 */
export const betterAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	// Step 1: Get session from Better Auth
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	// Step 2: Validate session exists
	if (!session) {
		throw new RecaseError({
			message: "Unauthorized - no session found",
			code: ErrCode.NoAuthHeader,
			statusCode: 401,
		});
	}

	// Step 3: Extract orgId and userId
	const orgId = session?.session?.activeOrganizationId;
	const userId = session?.user?.id;

	if (!orgId) {
		throw new RecaseError({
			message: "Unauthorized - no org id found",
			code: ErrCode.InvalidAuthHeader,
			statusCode: 401,
		});
	}

	if (!userId) {
		throw new RecaseError({
			message: "Unauthorized - no user id found",
			code: ErrCode.InvalidAuthHeader,
			statusCode: 401,
		});
	}

	// Step 4: Fetch org and features from database
	const appEnvHeader = c.req.header("app_env") as AppEnv;
	if (appEnvHeader) {
		ctx.env = appEnvHeader;
	}
	const data = await OrgService.getWithFeatures({
		db: ctx.db,
		orgId: orgId,
		env: ctx.env,
	});

	if (!data) {
		throw new RecaseError({
			message: "Org not found",
			code: ErrCode.OrgNotFound,
			statusCode: 500,
		});
	}

	const { org, features } = data;

	// Step 5: Store in context
	ctx.org = org;
	ctx.features = features;
	ctx.userId = userId;
	ctx.authType = AuthType.Dashboard;

	await next();
};
