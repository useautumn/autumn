import { deduct } from "../../deduction/deduct.js";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
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

	const outcome = deduct({
		fullSubject,
		featureId: command.featureId,
		overageBehavior: "reject",
		now: command.occurredAt,
		value: command.requiredBalance,
	});
	if (outcome.context.customerEntitlements.length === 0) {
		throw new UnsupportedCommandError({ reason: "feature_not_found" });
	}

	const allowed = !outcome.rejected;
	return {
		allowed,
		reason: allowed ? null : "insufficient_balance",
		requiredBalance: command.requiredBalance,
	};
};
