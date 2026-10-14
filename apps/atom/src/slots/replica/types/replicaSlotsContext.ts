import type { CatalogStore } from "../../../state/types/catalogStore.js";
import type { SlotOwners } from "../../../threads/owners/types/slotOwners.js";
import type { OpenedSlot } from "../../types/openedSlot.js";

export type ReplicaSlotsContext = {
	slots: OpenedSlot[];
	slotCount: number;
	owners: SlotOwners;
	catalogStore: CatalogStore;
	atomId: string | null;
};
