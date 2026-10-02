import type { Context } from "hono";
import type { SharedContext } from "./sharedContext.js";
import { atomIdBodyToId } from "./sharedContracts.js";

export const receiveDeleteAtom = ({ ctx }: { ctx: SharedContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		ctx.auth.removeAtom({ id });
		return context.json({ id, deleted: true });
	};
