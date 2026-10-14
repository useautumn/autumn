import type { SubjectState, WorkerFullSubject } from "@autumn/balance-engine";
import type { JournalEntry } from "../../../../state/journal/types/journal.js";
import type { SharedCatalog } from "../../../../state/types/catalogStore.js";
import type { StoredSubject } from "../../../../state/types/storedSubject.js";
import type { CurrentSubject } from "../../../types/currentSubject.js";

/** A joined view and the parts it was joined from: current while the store and journal still hold these very copies. */
export type ViewFold = {
	customer: StoredSubject;
	shared: SharedCatalog | null;
	owed: readonly JournalEntry[];
	/** The customer's own rows with `owed` applied, which a later append continues from. */
	customerState: SubjectState;
	current: CurrentSubject;
};

/** What a view's customer rows start from: the stored copy, or a cached fold that already applied `applied`. */
export type ReplayBase = {
	state: SubjectState;
	applied: readonly JournalEntry[];
	/** `state` joined, when the cached view is the customer's own: its fullSubject is exactly that. */
	fullSubject: WorkerFullSubject | null;
};
