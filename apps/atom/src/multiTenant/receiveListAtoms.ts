import type { Context } from "hono";
import type { AtomsListResponse } from "../replication/catchUp/fetchSince.js";
import type { MultiTenantContext } from "./multiTenantContext.js";

/** What a peer catching up learns first: every tenant held here, so it can hold them before copying their rows. */
export const receiveListAtoms = ({
	ctx,
}: {
	ctx: MultiTenantContext | undefined;
}) =>
	function receive(context: Context) {
		const atoms = ctx?.auth.listAtoms() ?? [];
		return context.json({
			atoms: atoms.map(({ id, tokenHash }) => ({ id, token_hash: tokenHash })),
		} satisfies AtomsListResponse);
	};
