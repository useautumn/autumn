import type { SubjectState } from "../../models/subject/subjectState.js";
import {
	findStructuralDifference,
	type StructuralDifference,
} from "../findStructuralDifference.js";

/**
 * The rows alone. The revision is the worker's count since it last loaded the customer, which a resend or a reload
 * moves; atom_seqs only the worker's apply of an Atom's track writes, never the Atom's own replay of it.
 */
export const subjectStateRowsOf = (state: SubjectState) => ({
	...state,
	revision: undefined,
	customer: { ...state.customer, atom_seqs: undefined },
});

/** Where two states' rows first differ; null when they hold the same rows. */
export const findSubjectStateDifference = ({
	left,
	right,
}: {
	left: SubjectState;
	right: SubjectState;
}): StructuralDifference | null =>
	findStructuralDifference({
		left: subjectStateRowsOf(left),
		right: subjectStateRowsOf(right),
	});
