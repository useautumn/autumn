import type { Context, MiddlewareHandler, Next } from "hono";
import { isServing } from "../../init/atomHealth.js";
import { FORWARDED_HEADER } from "../forward/forwardRequest.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A check reaching a loop this far behind has waited at least as long; answering it would only push the next ones later. */
export const MAX_LOOP_LAG_MS = 100;

/**
 * Outermost on checks: while the thread's loop is behind, or once it is stopping, a check is refused at once, before its
 * body is read or a line logged. Its 503 carries no x-atom-forwarded, so the SDK, Autumn's shadow and a peer ask the API.
 * A thread still catching up is behind by nature and answers nothing itself: its checks go on, to be handed to a peer.
 */
export function admissionMiddleware({
	ctx,
	retriedAtAtom = false,
}: {
	ctx: Pick<AtomHttpContext, "counters" | "loop" | "stopping" | "health">;
	/** Marks the 503 x-atom-forwarded, so the SDK returns it to its caller instead of asking the API. */
	retriedAtAtom?: boolean;
}): MiddlewareHandler<AtomHttpEnv> {
	const headersOf = (code: string) =>
		retriedAtAtom ? { [FORWARDED_HEADER]: code } : undefined;

	async function admit(context: Context<AtomHttpEnv>, next: Next) {
		if (ctx.stopping?.())
			return context.json(
				{
					message: "Atom is stopping; ask the Autumn API",
					code: "atom_stopping",
				},
				503,
				headersOf("atom_stopping"),
			);
		if (!isServing(ctx.health) || ctx.loop.lagMs() <= MAX_LOOP_LAG_MS)
			return next();
		ctx.counters.add("shed");
		return context.json(
			{
				message: "Atom is behind; ask the Autumn API",
				code: "atom_overloaded",
			},
			503,
			headersOf("atom_overloaded"),
		);
	}
	return admit;
}
