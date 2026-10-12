import type { CatalogStore } from "../../../state/types/catalogStore.js";
import type { SlotOwners } from "../../../threads/owners/types/slotOwners.js";
import type { OpenedSlot } from "../../types/openedSlot.js";

/** What a replica-facing call on an open data folder reaches: its slots, who owns each, and the catalog they share. */
export type ReplicaSlotsContext = {
	slots: OpenedSlot[];
	slotCount: number;
	owners: SlotOwners;
	catalogStore: CatalogStore;
	/** The folder's name on a multi-tenant Atom, so a call to another thread names it too. */
	atomId: string | null;
};
