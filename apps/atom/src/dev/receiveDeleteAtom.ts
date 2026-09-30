import type { Context } from "hono";
import type { DevContext } from "./devContext.js";
import { atomIdBodyToId } from "./devContracts.js";

export const receiveDeleteAtom = ({ ctx }: { ctx: DevContext }) =>
	async function receive(context: Context) {
		const id = atomIdBodyToId({ body: await context.req.json() });
		ctx.auth.removeAtom({ id });
		return context.json({ id, deleted: true });
	};
