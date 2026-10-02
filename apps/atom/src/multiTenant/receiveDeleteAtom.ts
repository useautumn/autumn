import type { Context } from "hono";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { atomIdBodyToId } from "./multiTenantContracts.js";

export const receiveDeleteAtom = ({ ctx }: { ctx: MultiTenantContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		ctx.auth.removeAtom({ id });
		return context.json({ id, deleted: true });
	};
