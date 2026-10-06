import type { SlotProcessor } from "../../../processor/types/slotProcessor.js";

/** Which thread owns each slot, and how this thread reaches the others. Each slot's file is opened by its owner only. */
export type SlotOwners = {
	/** This thread. */
	index: number;
	ownerOf(params: { slot: number }): number;
	/** The slots `thread` owns in the folder `atomId` names, answered there. */
	processorOn(params: { thread: number; atomId: string | null }): SlotProcessor;
};
