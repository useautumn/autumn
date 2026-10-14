import {
	type Catalog,
	isSameCatalog,
	isSameSubjectState,
} from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import { replayOwed } from "./replayOwed.js";
import type { ReplayBase, ViewFold } from "./types/viewFold.js";

/** How many of the fold's entries the push trimmed from the front, when what remains still leads `owed`; null otherwise. */
const trimmedCountOf = ({
	fold,
	owed,
}: {
	fold: ViewFold;
	owed: readonly JournalEntry[];
}): number | null => {
	const [first] = owed;
	const trimmed = first ? fold.owed.indexOf(first) : -1;
	if (trimmed < 0) return null;
	const kept = fold.owed.slice(trimmed);
	return kept.every((entry, index) => owed[index] === entry) ? trimmed : null;
};

/**
 * The fold to continue after a push that only acknowledged this Atom's own deductions: Autumn's new copy is the old one
 * with the trimmed entries applied, so the cached fold over the rest is already the view. Null when Autumn applied anything else.
 */
export const foldAcrossPush = ({
	fold,
	customer,
	owed,
	catalog,
}: {
	fold: ViewFold;
	customer: StoredSubject;
	owed: readonly JournalEntry[];
	catalog: Catalog;
}): ReplayBase | null => {
	const trimmed = trimmedCountOf({ fold, owed });
	if (trimmed === null) return null;
	// Each applied track moves the revision once, so anything else Autumn applied shows here before any replay.
	const revision = fold.customer.state.revision + trimmed;
	if (customer.state.revision !== revision) return null;
	if (!isSameCatalog({ left: fold.current.catalog, right: catalog }))
		return null;
	const acknowledged =
		trimmed === 0
			? fold.customer.state
			: replayOwed({
					owed: fold.owed.slice(0, trimmed),
					state: fold.customer.state,
					catalog,
				});
	if (!isSameSubjectState({ left: acknowledged, right: customer.state }))
		return null;
	return {
		// The worker's apply of the trimmed entries raised the push's atom_seqs; the Atom's replay never writes it.
		state: {
			...fold.customerState,
			customer: {
				...fold.customerState.customer,
				atom_seqs: customer.state.customer.atom_seqs,
			},
		},
		applied: fold.owed.slice(trimmed),
		fullSubject: null,
	};
};
