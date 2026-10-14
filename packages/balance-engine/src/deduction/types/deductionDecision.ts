import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { DeductionOutcome } from "./deductionOutcome.js";

export type DeductionDecision = {
	mutation: SubjectStateMutation;
	outcome: DeductionOutcome;
};
