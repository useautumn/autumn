import { deduct } from "../../deduction/deduct.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { checkCommandToDeductionRequest } from "./checkCommandToDeductionRequest.js";
import { checkOutcomeToResult } from "./checkOutcomeToResult.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

/** A check is a reject-mode deduction that is never written: allowed iff the deduction would not be refused. */
export const computeCheck = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
}): CheckResult => {
	assertCommandSupported({ fullSubject, command });
	return checkOutcomeToResult({
		fullSubject,
		command,
		outcome: deduct({
			fullSubject,
			request: checkCommandToDeductionRequest({ command }),
		}),
	});
};
