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
	const user = session?.user;

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
	ctx.user = user;

	/**
	 * Pull scopes injected by the `customSession` better-auth plugin
	 * (see `server/src/utils/auth.ts`). The plugin augments the session
	 * response with top-level `role` and `scopes` fields derived from the
	 * user's membership row in the active organisation.
	 *
	 * `as any` is used deliberately: better-auth's `getSession` return
	 * type does not auto-infer `customSession` additions in all TS
	 * setups, and the better-auth docs recommend this cast as the
	 * workaround. The fallback `?? []` preserves the "no scopes = legacy
	 * unrestricted" convention documented on `RequestContext.scopes`.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: documented better-auth workaround
	ctx.scopes = (session as any).scopes ?? [];

	await next();
};
