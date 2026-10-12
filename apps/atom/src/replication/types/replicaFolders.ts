import type { TenantAtom } from "../../multiTenant/atomFolders.js";
import type { Slots } from "../../slots/types/slots.js";

/** One folder a replica keeps in step with its peers: a tenant's on a multi-tenant Atom, the one folder of an org's own. */
export type ReplicaFolder = { atomId: string | null; slots: Slots };

/** The folders this replica holds, and how it takes on the ones a peer holds that it lacks. */
export type ReplicaFolders = {
	all(): ReplicaFolder[];
	/** A multi-tenant Atom registers the tenants a peer lists; an org's own Atom has nothing to learn. */
	learn(params: { tenants: TenantAtom[] }): void;
};
