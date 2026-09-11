import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { auth } from "@/utils/auth.js";
import { createImpersonationCliTokens } from "./createImpersonationCliTokens.js";
import { ensureAdminOAuthClient } from "./ensureAdminOAuthClient.js";

/**
 * POST /admin/impersonation/cli-tokens — behind adminAuthMiddleware, and
 * additionally requires the session to be an active impersonation so the
 * tokens are always bound to the customer org being impersonated.
 */
export const handleCreateImpersonationCliTokens = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		const impersonatedBy = session?.session?.impersonatedBy;
		if (!impersonatedBy || !ctx.user) {
			throw new RecaseError({
				message: "CLI impersonation tokens require an impersonation session",
				code: ErrCode.InvalidRequest,
				statusCode: 403,
			});
		}

		await ensureAdminOAuthClient({ db: ctx.db });
		const tokens = await createImpersonationCliTokens({
			db: ctx.db,
			impersonatedBy,
			orgId: ctx.org.id,
			scopes: ctx.scopes,
			userId: ctx.user.id,
		});

		return c.json({
			sandbox_token: tokens.sandboxToken,
			live_token: tokens.liveToken,
			expires_at: tokens.expiresAt.toISOString(),
		});
	},
});
