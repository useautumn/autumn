import type { TenantAtom } from "../../multiTenant/atomFolders.js";
import type { Slots } from "../../slots/types/slots.js";

export type ReplicaFolder = { atomId: string | null; slots: Slots };

export type ReplicaFolders = {
	all(): ReplicaFolder[];
	learn(params: { tenants: TenantAtom[] }): void;
};
