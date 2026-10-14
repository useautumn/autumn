import type { ReplicationHandler } from "../replication/types/replicationHandler.js";

export const ATOM_PUT: ReplicationHandler = {
	kind: "atoms.put",
	path: "/v1/atoms.put",
};
export const ATOM_DELETE: ReplicationHandler = {
	kind: "atoms.delete",
	path: "/v1/atoms.delete",
};

export const atomKeyOf = ({ id }: { id: string }): string => `atom\u0000${id}`;
