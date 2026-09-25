import {
	type DeductionOutcome,
	deductFinalize,
	deductTrack,
	type SubjectStateMutation,
	type WorkerFullSubject,
} from "@autumn/balance-engine";

/** The deduction a track or finalize mutation was made from, made again on the subject it found: deductions are pure. */
const deductionOf = ({
	mutation,
	before,
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
}): DeductionOutcome => {
	const { command } = mutation;
	if (command.type === "track")
		return deductTrack({ fullSubject: before, command });
	if (command.type === "finalize")
		return deductFinalize({ fullSubject: before, command });
	throw new Error(`No deduction behind a ${command.type} mutation`);
};

/** What the worker hands the webhooks: the subject as the mutation found and left it, and the deduction behind it. */
export const withDeduction = <
	Decided extends { mutation: SubjectStateMutation; before: WorkerFullSubject },
>(
	decided: Decided,
): Decided & { deduction: DeductionOutcome } => ({
	...decided,
	deduction: deductionOf(decided),
});
