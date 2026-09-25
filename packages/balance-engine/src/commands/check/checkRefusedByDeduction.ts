import {
	type DeductionStart,
	deductOnContext,
} from "../../deduction/deduct.js";
import { deductionContextFor } from "../../deduction/setup/deductionContextFor.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { checkCommandToDeductionRequest } from "./checkCommandToDeductionRequest.js";
import { checkOutcomeToResult } from "./checkOutcomeToResult.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

/**
 * The check a deduction turned from allowed to refused, or null. Both sides draw on one setup over the stored rows:
 * the after side starts where the deduction left the balances and caps, so nothing is joined or selected twice.
 */
export const checkRefusedByDeduction = ({
	fullSubject,
	command,
	deduction,
}: {
	/** The subject the deduction was made on. */
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
	deduction: DeductionOutcome;
}): CheckResult | null => {
	assertCommandSupported({ fullSubject, command });
	// A refused deduction wrote nothing, so it cannot have refused anything else.
	if (deduction.rejected) return null;

	const request = checkCommandToDeductionRequest({ command });
	const context = deductionContextFor({
		fullSubject,
		request,
		reusing: deduction,
	});
	const checkFrom = (from?: DeductionStart): CheckResult => {
		const outcome = deductOnContext({ context, request, from });
		// The check answers for its own draw, not for the deduction it started from.
		const checkDeltas = outcome.deltas.slice(from?.deltas.length ?? 0);
		return checkOutcomeToResult({
			fullSubject,
			command,
			outcome: { ...outcome, deltas: checkDeltas },
		});
	};

	const after = checkFrom(deduction);
	if (after.allowed) return null;
	return checkFrom().allowed ? after : null;
};
