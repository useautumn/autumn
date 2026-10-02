import type { Context } from "hono";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { putAtomBodyToTenantAtom } from "./multiTenantContracts.js";

export const receivePutAtom = ({ ctx }: { ctx: MultiTenantContext }) =>
	async function receive(context: Context) {
		const tenantAtom = putAtomBodyToTenantAtom({
			body: await context.req.json(),
		});
		ctx.auth.putAtom(tenantAtom);
		return context.json({ id: tenantAtom.id });
	};
