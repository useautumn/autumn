import type { Context, MiddlewareHandler, Next } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

export const MAX_LOOP_LAG_MS = 100;

export function admissionMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "counters" | "loop">;
}): MiddlewareHandler<AtomHttpEnv> {
	async function admit(context: Context<AtomHttpEnv>, next: Next) {
		if (ctx.loop.lagMs() <= MAX_LOOP_LAG_MS) return next();
		ctx.counters.add("shed");
		return context.json(
			{
				message: "Atom is behind; ask the Autumn API",
				code: "atom_overloaded",
			},
			503,
		);
	}
	return admit;
}
