import type { Context } from "hono";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { atomIdBodyToId } from "./multiTenantContracts.js";

/** Null when no thread holds the Atom any more, so the admin knows to put it again. */
export const receiveGetAtom = ({ ctx }: { ctx: MultiTenantContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		return context.json({ atom: ctx.auth.hasAtom({ id }) ? { id } : null });
	};
