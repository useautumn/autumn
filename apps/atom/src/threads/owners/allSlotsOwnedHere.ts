import type { SlotOwners } from "./types/slotOwners.js";

/** One thread owning every slot: an Atom run in a single thread, as its unit tests do. */
const noOtherThread = ({ thread }: { thread: number }): never => {
	throw new Error(`No thread ${thread}: this Atom runs in one thread`);
};

export const allSlotsOwnedHere: SlotOwners = {
	index: 0,
	threads: 1,
	ownerOf: () => 0,
	processorOn: noOtherThread,
	catalogOn: noOtherThread,
};
