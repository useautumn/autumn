import { deductWithContext } from "../../deduction/deduct.js";
import { setupDeductionContext } from "../../deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../deduction/types/deductionContext.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { checkCommandToDeductionRequest } from "./checkCommandToDeductionRequest.js";
import { outcomeToCheckResult } from "./outcomeToCheckResult.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

/** A check is a reject-mode deduction that is never written: allowed iff the deduction would not be refused. */
export const computeCheck = ({
	fullSubject,
	command,
	context,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
	/** Already set up for this command's selection on `fullSubject`; set up here when absent. */
	context?: DeductionContext;
}): CheckResult => {
	assertCommandSupported({ fullSubject, command });
	const request = checkCommandToDeductionRequest({ command });
	const outcome = deductWithContext({
		context:
			context ??
			setupDeductionContext({ fullSubject, selection: request.selection }),
		request,
	});
	return outcomeToCheckResult({ fullSubject, command, outcome });
};
