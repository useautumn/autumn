import type { ReplicationHandler } from "../replication/types/replicationHandler.js";

/** A tenant put or deleted on one replica is put or deleted on the others, the same body on the same route. */
export const ATOM_PUT: ReplicationHandler = {
	kind: "atoms.put",
	path: "/v1/atoms.put",
};
export const ATOM_DELETE: ReplicationHandler = {
	kind: "atoms.delete",
	path: "/v1/atoms.delete",
};

/** One key per tenant for both kinds: a newer put or delete replaces an older one still on its way. */
export const atomKeyOf = ({ id }: { id: string }): string => `atom\u0000${id}`;
