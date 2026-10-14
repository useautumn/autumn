import type { Context } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../http/types/atomHttp.js";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { putAtomBodyToTenantAtom } from "./multiTenantContracts.js";
import { ATOM_PUT, atomKeyOf } from "./replicateAtoms.js";

export const receivePutAtom = ({
	ctx,
}: {
	ctx: MultiTenantContext & Pick<AtomHttpContext, "replication">;
}) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const body = await context.req.text();
		const tenantAtom = putAtomBodyToTenantAtom({ body: JSON.parse(body) });
		ctx.auth.putAtom(tenantAtom);
		if (!context.get("relayed"))
			ctx.replication.replicate({
				kind: ATOM_PUT.kind,
				key: atomKeyOf(tenantAtom),
				body,
				atomId: null,
			});
		return context.json({ id: tenantAtom.id });
	};
