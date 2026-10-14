import type { SubjectState } from "../../models/subject/subjectState.js";
import {
	findStructuralDifference,
	type StructuralDifference,
} from "../findStructuralDifference.js";

/** Only the worker's apply of an Atom's track writes it; the Atom's own replay of the same track never does. */
const withoutAtomSeqs = (state: SubjectState): SubjectState => ({
	...state,
	customer: { ...state.customer, atom_seqs: undefined },
});

/** Where two states first differ; null when the same mutations were applied to both. */
export const findSubjectStateDifference = ({
	left,
	right,
}: {
	left: SubjectState;
	right: SubjectState;
}): StructuralDifference | null =>
	findStructuralDifference({
		left: withoutAtomSeqs(left),
		right: withoutAtomSeqs(right),
	});
