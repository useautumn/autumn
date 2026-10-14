import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { DeductionOutcome } from "./deductionOutcome.js";

/** What a deducting command decided: the mutation it logs, and the deduction behind it for the effects to read. */
export type DeductionDecision = {
	mutation: SubjectStateMutation;
	outcome: DeductionOutcome;
};

/** A finalize that settled nothing moved no balance, so no deduction stands behind it. */
export type FinalizeDecision = Omit<DeductionDecision, "outcome"> & {
	outcome: DeductionOutcome | null;
};
