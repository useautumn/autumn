import {
	type Catalog,
	findStructuralDifference,
	findSubjectStateDifference,
	type StructuralDifference,
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

/** Which guard a push failed, so the fold was replayed from it: and where Autumn's copy first differs, when that is known. */
export type FoldRebuilt = {
	rebuiltFor: "trim" | "revision" | "catalog" | "state";
	difference: StructuralDifference | null;
};

/**
 * The fold to continue after a push that only acknowledged this Atom's own deductions: Autumn's new copy is the old one
 * with the trimmed entries applied, so the cached fold over the rest is already the view. Anything else Autumn applied rebuilds it.
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
}): { kept: ReplayBase } | FoldRebuilt => {
	const trimmed = trimmedCountOf({ fold, owed });
	if (trimmed === null) return { rebuiltFor: "trim", difference: null };
	// Each applied track moves the revision once, so anything else Autumn applied shows here before any replay.
	const revision = fold.customer.state.revision + trimmed;
	if (customer.state.revision !== revision)
		return {
			rebuiltFor: "revision",
			difference: {
				path: "revision",
				left: revision,
				right: customer.state.revision,
			},
		};
	const catalogDifference = findStructuralDifference({
		left: fold.current.catalog,
		right: catalog,
	});
	if (catalogDifference)
		return { rebuiltFor: "catalog", difference: catalogDifference };
	const acknowledged =
		trimmed === 0
			? fold.customer.state
			: replayOwed({
					owed: fold.owed.slice(0, trimmed),
					state: fold.customer.state,
					catalog,
				});
	const stateDifference = findSubjectStateDifference({
		left: acknowledged,
		right: customer.state,
	});
	if (stateDifference)
		return { rebuiltFor: "state", difference: stateDifference };
	return {
		kept: {
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
		},
	};
};
