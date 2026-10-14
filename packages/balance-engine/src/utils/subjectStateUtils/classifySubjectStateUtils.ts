import type { SubjectState } from "../../models/subject/subjectState.js";
import { isStructurallyEqual } from "../isStructurallyEqual.js";

/** Only the worker's apply of an Atom's track writes it; the Atom's own replay of the same track never does. */
const withoutAtomSeqs = (state: SubjectState): SubjectState => ({
	...state,
	customer: { ...state.customer, atom_seqs: undefined },
});

/** The same rows at the same revision: the same mutations were applied to both. */
export const isSameSubjectState = ({
	left,
	right,
}: {
	left: SubjectState;
	right: SubjectState;
}): boolean =>
	left.revision === right.revision &&
	isStructurallyEqual(withoutAtomSeqs(left), withoutAtomSeqs(right));
