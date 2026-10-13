import type { Auth } from "../../auth/types/auth.js";
import type { MultiTenantAuth } from "../../multiTenant/createMultiTenantAuth.js";
import type { Slots } from "../../slots/types/slots.js";
import type { ReplicaFolders } from "../types/replicaFolders.js";

/** An org's own Atom: its one folder, and no tenants to learn. */
export const createDeployedFolders = ({
	slots,
}: {
	slots: Slots;
}): ReplicaFolders => ({
	all: () => [{ atomId: null, slots }],
	learn: () => {},
});

/** A multi-tenant Atom: every tenant's folder, and the tenants a peer holds that this one does not yet. */
export const createMultiTenantFolders = ({
	auth,
}: {
	auth: Pick<Auth, "slotsFor"> & Pick<MultiTenantAuth, "listAtoms" | "putAtom">;
}): ReplicaFolders => ({
	all: () =>
		auth.listAtoms().flatMap(({ id }) => {
			const slots = auth.slotsFor({ atomId: id });
			return slots ? [{ atomId: id, slots }] : [];
		}),
	// Only additions and re-tokens: a peer that lacks a tenant may be the one still catching up, so nothing is removed here.
	learn: ({ tenants }) => {
		const held = new Map(
			auth.listAtoms().map((atom) => [atom.id, atom.tokenHash]),
		);
		for (const tenant of tenants)
			if (held.get(tenant.id) !== tenant.tokenHash) auth.putAtom(tenant);
	},
});
