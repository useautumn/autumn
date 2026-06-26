import { AppEnv, AuthType, ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";
import { assertSandboxAccess, SANDBOX_ORG_HEADER } from "./sandboxAccess.js";

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

	// biome-ignore lint/suspicious/noExplicitAny: getSession doesn't infer customSession scopes
	const sessionScopes: string[] = (session as any).scopes ?? [];

	// Step 4: Resolve target org + env (a sandbox sub-org when x-sandbox-org-id set)
	const appEnvHeader = c.req.header("app_env") as AppEnv | undefined;
	const sandboxOrgId = c.req.header(SANDBOX_ORG_HEADER);

	type OrgWithFeatures = NonNullable<
		Awaited<ReturnType<typeof OrgService.getWithFeatures>>
	>;
	let resolved: OrgWithFeatures;

	if (sandboxOrgId) {
		const candidate = await OrgService.getWithFeatures({
			db: ctx.db,
			orgId: sandboxOrgId,
			env: AppEnv.Sandbox,
			allowNotFound: true,
		});
		assertSandboxAccess({
			sessionOrgId: orgId,
			sandboxOrgId,
			candidate: candidate?.org ?? null,
			appEnv: appEnvHeader,
			scopes: sessionScopes,
		});
		// Non-null: assertSandboxAccess throws on a missing candidate.
		resolved = candidate as OrgWithFeatures;
		ctx.env = AppEnv.Sandbox;
	} else {
		if (appEnvHeader) {
			ctx.env = appEnvHeader;
		}
		const data = await OrgService.getWithFeatures({
			db: ctx.db,
			orgId,
			env: ctx.env,
		});
		if (!data) {
			throw new RecaseError({
				message: "Org not found",
				code: ErrCode.OrgNotFound,
				statusCode: 500,
			});
		}
		resolved = data;
	}

	// Step 5: Store in context
	ctx.org = resolved.org;
	ctx.features = resolved.features;
	ctx.userId = userId;
	ctx.authType = AuthType.Dashboard;
	ctx.user = user;
	ctx.scopes = sessionScopes;

	await next();
};
