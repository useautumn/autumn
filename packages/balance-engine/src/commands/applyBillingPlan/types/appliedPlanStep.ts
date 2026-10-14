import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";

export type AppliedPlanStep = {
	changes: RowChange[];
	state: SubjectState;
};
