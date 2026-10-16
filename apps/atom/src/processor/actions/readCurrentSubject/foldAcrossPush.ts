import {
	type Catalog,
	findStructuralDifference,
	findSubjectStateDifference,
	type StructuralDifference,
	subjectStateRowsOf,
} from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import { NO_ENTITY_PARTS, replayOwed } from "./replayOwed.js";
import type { ReplayBase, ViewFold } from "./types/viewFold.js";

/** The entries a fold applied: the journal may have grown its array since. */
export const appliedOf = ({ fold }: { fold: ViewFold }) =>
	fold.owed.slice(0, fold.applied);

/** How many of the fold's entries the push trimmed from the front, when what remains still leads `owed`; null otherwise. */
const trimmedCountOf = ({
	fold,
	owed,
}: {
	fold: ViewFold;
	owed: readonly JournalEntry[];
}): number | null => {
	const applied = appliedOf({ fold });
	const [first] = owed;
	const trimmed = first ? applied.indexOf(first) : -1;
	if (trimmed < 0) return null;
	const kept = applied.slice(trimmed);
	return kept.every((entry, index) => owed[index] === entry) ? trimmed : null;
};

/** Which guard a push failed, so the fold was replayed from it: and where Autumn's copy first differs, when that is known. */
export type FoldRebuilt = {
	rebuiltFor: "trim" | "catalog" | "state" | "entity";
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
	// An entity's entries moved rows its own push replaces apart from this one: only a customer-only fold is compared.
	if (fold.parts.entities.size > 0)
		return { rebuiltFor: "entity", difference: null };
	const trimmed = trimmedCountOf({ fold, owed });
	if (trimmed === null) return { rebuiltFor: "trim", difference: null };
	// Bun's compare decides; the path finder, ten times slower, runs only to name what differs.
	if (!Bun.deepEquals(fold.current.catalog, catalog))
		return {
			rebuiltFor: "catalog",
			difference: findStructuralDifference({
				left: fold.current.catalog,
				right: catalog,
			}),
		};
	const acknowledged =
		trimmed === 0
			? fold.customer.state
			: replayOwed({
					owed: fold.owed.slice(0, trimmed),
					parts: { customer: fold.customer.state, entities: NO_ENTITY_PARTS },
					catalog,
					entityCopyOf: () => null,
				}).customer;
	if (
		!Bun.deepEquals(
			subjectStateRowsOf(acknowledged),
			subjectStateRowsOf(customer.state),
		)
	)
		return {
			rebuiltFor: "state",
			difference: findSubjectStateDifference({
				left: acknowledged,
				right: customer.state,
			}),
		};
	// The fold's own steps past the acknowledged ones, counted on from Autumn's revision so the next replay starts there.
	const stepsPastPush = fold.parts.customer.revision - acknowledged.revision;
	return {
		kept: {
			// The worker's apply of the trimmed entries raised the push's atom_seqs; the Atom's replay never writes it.
			parts: {
				customer: {
					...fold.parts.customer,
					revision: customer.state.revision + stepsPastPush,
					customer: {
						...fold.parts.customer.customer,
						atom_seqs: customer.state.customer.atom_seqs,
					},
				},
				entities: NO_ENTITY_PARTS,
			},
			applied: fold.applied - trimmed,
			fullSubject: null,
		},
	};
};
