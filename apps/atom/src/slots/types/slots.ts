import type { CatalogRow } from "@autumn/balance-engine";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import type { StoredSubject } from "../../state/types/storedSubject.js";

/** Where a replica copies the subjects it missed from: a peer, asked one slot at a time. */
export type SubjectSource = (params: {
	slot: number;
	slotCount: number;
	readAtAfter: number;
	limit: number;
}) => Promise<StoredSubject[]>;

/** One data folder: its customers, reached through the slot each lives in, and the one catalog they share. */
export type Slots = {
	processorFor(params: { customerId: string }): SlotProcessor;
	/** Stored by the catalog's owner thread and held by every thread. False when it was read before the one held, and so ignored. */
	setCatalog(params: { rows: CatalogRow[]; readAt: number }): Promise<boolean>;
	/** Holds what the catalog's owner thread stored, on this thread. */
	installCatalog(params: { rows: CatalogRow[]; readAt: number }): boolean;
	/** A slot's subjects read after `readAtAfter`, oldest first, answered by the slot's owner. */
	listSince(params: {
		slot: number;
		readAtAfter: number;
		limit: number;
	}): Promise<StoredSubject[]>;
	/** Copies into the slots this thread owns what `source` holds newer than they do; returns how many were written. */
	catchUp(params: {
		source: SubjectSource;
	}): Promise<{ slots: number; written: number }>;
	close(): void;
};
