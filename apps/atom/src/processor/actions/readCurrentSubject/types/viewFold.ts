import type { WorkerFullSubject } from "@autumn/balance-engine";
import type { JournalEntry } from "../../../../state/journal/types/journal.js";
import type { SharedCatalog } from "../../../../state/types/catalogStore.js";
import type { StoredSubject } from "../../../../state/types/storedSubject.js";
import type { CurrentSubject } from "../../../types/currentSubject.js";
import type { SubjectParts } from "../replayOwed.js";

/** A joined view and the parts it was joined from: current while the store and journal still hold these very copies. */
export type ViewFold = {
	customer: StoredSubject;
	shared: SharedCatalog | null;
	/** The journal's array as read: an append grows it in place, so only its first `applied` entries are in this fold. */
	owed: readonly JournalEntry[];
	applied: number;
	/** The customer's own rows, and each entity's an entry named, with those entries applied: a later append continues from them. */
	parts: SubjectParts;
	current: CurrentSubject;
};

/** What a view's rows start from: the stored copies, or a cached fold that already applied the first `applied` owed. */
export type ReplayBase = {
	parts: SubjectParts;
	applied: number;
	/** `parts.customer` joined, when the cached view is the customer's own: its fullSubject is exactly that. */
	fullSubject: WorkerFullSubject | null;
};
