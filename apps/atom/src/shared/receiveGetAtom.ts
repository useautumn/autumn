import type { Context } from "hono";
import type { SharedContext } from "./sharedContext.js";
import { atomIdBodyToId } from "./sharedContracts.js";

/** Null when this process does not hold the Atom, so the admin knows to put it again. */
export const receiveGetAtom = ({ ctx }: { ctx: SharedContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		return context.json({ atom: ctx.auth.hasAtom({ id }) ? { id } : null });
	};
