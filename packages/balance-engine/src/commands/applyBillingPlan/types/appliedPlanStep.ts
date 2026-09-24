import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";

/** One step of applying a plan: the changes it made, and the state after them. */
export type AppliedPlanStep = {
	changes: RowChange[];
	state: SubjectState;
};
