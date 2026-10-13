import type { Context } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../http/types/atomHttp.js";
import type { MultiTenantContext } from "./multiTenantContext.js";
import { atomIdBodyToId } from "./multiTenantContracts.js";
import { ATOM_DELETE, atomKeyOf } from "./replicateAtoms.js";

/** Applied here, then passed on to the other replicas unless it came from one. */
export const receiveDeleteAtom = ({
	ctx,
}: {
	ctx: MultiTenantContext & Pick<AtomHttpContext, "replication">;
}) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const body = await context.req.text();
		const id = atomIdBodyToId({ body: JSON.parse(body) });
		ctx.auth.removeAtom({ id });
		if (!context.get("relayed"))
			ctx.replication.replicate({
				kind: ATOM_DELETE.kind,
				key: atomKeyOf({ id }),
				body,
				atomId: null,
			});
		return context.json({ id, deleted: true });
	};
