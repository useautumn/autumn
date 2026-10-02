import type { Context } from "hono";
import type { SharedContext } from "./sharedContext.js";
import { putAtomBodyToSharedAtom } from "./sharedContracts.js";

export const receivePutAtom = ({ ctx }: { ctx: SharedContext }) =>
	async function receive(context: Context) {
		const sharedAtom = putAtomBodyToSharedAtom({
			body: await context.req.json(),
		});
		ctx.auth.putAtom(sharedAtom);
		return context.json({ id: sharedAtom.id });
	};
