import type { Context, MiddlewareHandler, Next } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A check reaching a loop this far behind has waited at least as long; answering it would only push the next ones later. */
export const MAX_LOOP_LAG_MS = 100;

/** A 503 with no x-atom-forwarded: the SDK, Autumn's shadow and a peer ask the API. */
export const overloaded = (context: Context<AtomHttpEnv>) =>
	context.json(
		{ message: "Atom is behind; ask the Autumn API", code: "atom_overloaded" },
		503,
	);

/**
 * Outermost on checks: while the thread's loop is behind, or once it is stopping, a check is refused at once, before its
 * body is read or a line logged. Its 503 carries no x-atom-forwarded, so the SDK, Autumn's shadow and a peer ask the API.
 */
export function admissionMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "counters" | "loop" | "stopping">;
}): MiddlewareHandler<AtomHttpEnv> {
	async function admit(context: Context<AtomHttpEnv>, next: Next) {
		if (ctx.stopping?.())
			return context.json(
				{
					message: "Atom is stopping; ask the Autumn API",
					code: "atom_stopping",
				},
				503,
			);
		if (ctx.loop.lagMs() <= MAX_LOOP_LAG_MS) return next();
		ctx.counters.add("shed");
		return overloaded(context);
	}
	return admit;
}
