import type { CatalogRow } from "@autumn/balance-engine";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import type { CustomerHandoff } from "../../replicas/handover/types/customerHandoff.js";
import type { Journal } from "../../state/journal/types/journal.js";
import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../../state/repos/subjectStates.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";

export type SubjectKey = { customerId: string; entityId: string };

/** One page of a slot as its owner lists it: from `after` by the owner's clock (null: everything), past `cursor`. */
export type SinceRequest = {
	slot: number;
	after: number | null;
	cursor: SubjectCursor | null;
	limit: number;
};

/** The shared catalog as a file holds it. */
export type CatalogRows = { rows: CatalogRow[]; readAt: number };

/**
 * Where a replica copies what it missed from: a peer, asked one slot at a time. `window` asks for what the peer wrote
 * in its last `window` ms by its own clock (null: everything); the answer names the absolute `after` the pages continue from.
 */
export type SubjectSource = {
	since(params: {
		slot: number;
		slotCount: number;
		after: number | null;
		window: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): Promise<{ after: number | null; subjects: AppliedSubject[] }>;
	/** The same pages as `since`, as identities and versions only: what to compare before asking for rows. */
	digest(params: {
		slot: number;
		slotCount: number;
		after: number | null;
		window: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): Promise<{ after: number | null; digests: SubjectDigest[] }>;
	/** The rows named, from one slot. */
	fetch(params: {
		slot: number;
		slotCount: number;
		keys: SubjectKey[];
	}): Promise<AppliedSubject[]>;
	/** The peer's catalog when it was read after `readAtAfter`; null otherwise. */
	catalog(params: { readAtAfter: number }): Promise<CatalogRows | null>;
};

/** One data folder: its customers, reached through the slot each lives in, and the one catalog they share. */
export type Slots = {
	/** The folder's name on a multi-tenant Atom; null for an org's own Atom's one folder. */
	atomId: string | null;
	/** How many files the folder is split into; a peer split differently holds nothing this one can copy. */
	slotCount: number;
	processorFor(params: { customerId: string }): SlotProcessor;
	/** Stored by the catalog's owner thread and held by every thread. False when it was read before the one held, and so ignored. */
	setCatalog(params: CatalogRows): Promise<boolean>;
	/** Holds what the catalog's owner thread stored, on this thread. */
	installCatalog(params: CatalogRows): boolean;
	/** The catalog's rows when they were read after `readAtAfter`, for a peer copying them; null otherwise. */
	catalogSince(params: { readAtAfter: number }): CatalogRows | null;
	/** A slot's subjects written at or after `after`, oldest write first, answered by the slot's owner. */
	listSince(params: SinceRequest): Promise<AppliedSubject[]>;
	/** The same pages as identities and versions only. */
	digestSince(params: SinceRequest): Promise<SubjectDigest[]>;
	/** A slot's rows by key, answered by the slot's owner. */
	fetchSubjects(params: {
		slot: number;
		keys: SubjectKey[];
	}): Promise<AppliedSubject[]>;
	/** The newest write in the slots this thread owns, by this replica's clock; 0 when they are empty. */
	maxAppliedAt(): number;
	/** The slot files this thread owns in the folder: what it alone may drop rows from. */
	ownedStores(): SqliteStore[];
	/** The journals of the slots this thread owns. */
	ownedJournals(): Journal[];
	/** What the slots this thread owns hold for each customer that another replica may own now: owed entries and open locks. */
	ownedHandoffs(): Promise<CustomerHandoff[]>;
	/**
	 * Copies into the slots this thread owns what `source` holds newer than they do, the catalog included: every row
	 * with `window` null (a fresh volume); else the digests of what the source wrote in its last `window` ms, and only
	 * the rows whose version is newer than the one held.
	 */
	catchUp(params: {
		source: SubjectSource;
		window: number | null;
	}): Promise<{ slots: number; written: number }>;
	close(): void;
};
