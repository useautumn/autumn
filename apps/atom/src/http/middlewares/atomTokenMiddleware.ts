import type { Context, MiddlewareHandler, Next } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

export const ATOM_TOKEN_HEADER = "x-atom-token";

export function atomTokenMiddleware({
	ctx,
}: {
	ctx: AtomHttpContext;
}): MiddlewareHandler<AtomHttpEnv> {
	async function authorizeRequest(context: Context<AtomHttpEnv>, next: Next) {
		const token = context.req.header(ATOM_TOKEN_HEADER);
		const slots = token ? ctx.auth.authorize({ token }) : null;
		if (!slots)
			return context.json(
				{ message: "Atom token required", code: "atom_token_required" },
				401,
			);
		context.set("slots", slots);
		await next();
	}
	return authorizeRequest;
}
