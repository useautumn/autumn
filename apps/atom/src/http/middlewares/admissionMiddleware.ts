import type { Context, MiddlewareHandler, Next } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A check reaching a loop this far behind has waited at least as long; answering it would only push the next ones later. */
export const MAX_LOOP_LAG_MS = 100;

/**
 * Outermost on checks: while the thread's loop is behind, a check is refused at once, before its body is read or a line
 * logged. Its 503 carries no x-atom-forwarded, so the SDK and Autumn's shadow both ask the Autumn API instead.
 */
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
