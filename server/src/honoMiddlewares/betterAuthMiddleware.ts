import { AppEnv, AuthType, ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";
import { assertSandboxAccess, SANDBOX_ORG_HEADER } from "./sandboxAccess.js";

export const betterAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session) {
		throw new RecaseError({
			message: "Unauthorized - no session found",
			code: ErrCode.NoAuthHeader,
			statusCode: 401,
		});
	}

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

	ctx.org = resolved.org;
	ctx.features = resolved.features;
	ctx.userId = userId;
	ctx.impersonatedBy = session.session.impersonatedBy ?? undefined;
	ctx.authType = AuthType.Dashboard;
	ctx.user = user;
	ctx.scopes = sessionScopes;

	await next();
};
