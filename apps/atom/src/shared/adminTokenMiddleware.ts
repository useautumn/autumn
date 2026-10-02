import type { Context, MiddlewareHandler, Next } from "hono";
import { tokenMatchesHash } from "../auth/tokenMatchesHash.js";
import type { AtomHttpEnv } from "../http/types/atomHttp.js";
import type { SharedContext } from "./sharedContext.js";

const ADMIN_TOKEN_HEADER = "x-atom-admin-token";

/** Only the admin token adds, reads or removes an org's Atom; an org's own token opens only its customers. */
export function adminTokenMiddleware({
	ctx,
}: {
	ctx: SharedContext;
}): MiddlewareHandler<AtomHttpEnv> {
	async function authorizeAdmin(context: Context<AtomHttpEnv>, next: Next) {
		const token = context.req.header(ADMIN_TOKEN_HEADER);
		const isAdmin =
			token !== undefined &&
			tokenMatchesHash({ token, expectedHash: ctx.adminTokenHash });
		if (!isAdmin)
			return context.json(
				{
					message: "Atom admin token required",
					code: "atom_admin_token_required",
				},
				401,
			);
		await next();
	}
	return authorizeAdmin;
}
