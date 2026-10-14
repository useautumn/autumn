import type { Auth } from "../../auth/types/auth.js";
import type { MultiTenantAuth } from "../../multiTenant/createMultiTenantAuth.js";
import type { Slots } from "../../slots/types/slots.js";
import type { ReplicaFolders } from "../types/replicaFolders.js";

export const createDeployedFolders = ({
	slots,
}: {
	slots: Slots;
}): ReplicaFolders => ({
	all: () => [{ atomId: null, slots }],
	learn: () => {},
});

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
	learn: ({ tenants }) => {
		const held = new Map(
			auth.listAtoms().map((atom) => [atom.id, atom.tokenHash]),
		);
		for (const tenant of tenants)
			if (held.get(tenant.id) !== tenant.tokenHash) auth.putAtom(tenant);
	},
});
