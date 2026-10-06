import type { SlotProcessor } from "../../../processor/types/slotProcessor.js";
import type { CatalogUpdate } from "./ownerCall.js";

/** A folder's catalog on another thread: stored by its owner, held by every other. */
export type CatalogCalls = {
	setCatalog(params: CatalogUpdate): Promise<boolean>;
	installCatalog(params: CatalogUpdate): Promise<boolean>;
};

/** Which thread owns each slot, and how this thread reaches the others. Each slot's file is opened by its owner only. */
export type SlotOwners = {
	/** This thread. */
	index: number;
	threads: number;
	ownerOf(params: { slot: number }): number;
	/** The slots `thread` owns in the folder `atomId` names, answered there. */
	processorOn(params: { thread: number; atomId: string | null }): SlotProcessor;
	catalogOn(params: { thread: number; atomId: string | null }): CatalogCalls;
};
