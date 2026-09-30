import type { Context } from "hono";
import type { DevContext } from "./devContext.js";
import { atomIdBodyToId } from "./devContracts.js";

/** Null when this process does not hold the Atom, so the server knows to put it again. */
export const receiveGetAtom = ({ ctx }: { ctx: DevContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		return context.json({ atom: ctx.auth.hasAtom({ id }) ? { id } : null });
	};
