import type { Context } from "hono";
import type { DevContext } from "./devContext.js";
import { putAtomBodyToDevAtom } from "./devContracts.js";

export const receivePutAtom = ({ ctx }: { ctx: DevContext }) =>
	async function receive(context: Context) {
		const devAtom = putAtomBodyToDevAtom({ body: await context.req.json() });
		ctx.auth.putAtom(devAtom);
		return context.json({ id: devAtom.id });
	};
