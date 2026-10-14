import type { Context } from "hono";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { atomIdBodyToId } from "./multiTenantContracts.js";

export const receiveGetAtom = ({ ctx }: { ctx: MultiTenantContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		return context.json({ atom: ctx.auth.hasAtom({ id }) ? { id } : null });
	};
