import type { SlotOwners } from "./types/slotOwners.js";

/** One thread owning every slot: an Atom run in a single thread, as its unit tests do. */
export const allSlotsOwnedHere: SlotOwners = {
	index: 0,
	ownerOf: () => 0,
	processorOn: ({ thread }) => {
		throw new Error(`No thread ${thread}: this Atom runs in one thread`);
	},
};
