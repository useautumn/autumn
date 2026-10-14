import { Decimal } from "decimal.js";
import {
	deductFromBuckets,
	deductionStateToOutcome,
} from "../../deduction/deduct.js";
import { setupDeductionContext } from "../../deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../deduction/types/deductionDelta.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { DeductionState } from "../../deduction/types/deductionState.js";
import { isSameSelection } from "../../deduction/utils/classifyDeductionUtils.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { checkCommandToDeductionRequest } from "./checkCommandToDeductionRequest.js";
import { outcomeToCheckResult } from "./outcomeToCheckResult.js";
import type { CheckCommand } from "./types/checkCommand.js";
import type { CheckResult } from "./types/checkResult.js";

export type CheckAfterDeduction = {
	after: CheckResult;
	before: () => CheckResult;
};

export const checkAfterDeduction = ({
	fullSubject,
	command,
	outcome,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
	outcome: DeductionOutcome;
}): CheckAfterDeduction => {
	assertCommandSupported({ fullSubject, command });
	const request = checkCommandToDeductionRequest({ command });
	const context: DeductionContext = isSameSelection({
		left: outcome.context.selection,
		right: request.selection,
	})
		? outcome.context
		: setupDeductionContext({ fullSubject, selection: request.selection });

	const checkWith = ({
		moved,
		windowsUsed,
		allocationUsed,
	}: {
		moved: DeductionDelta[];
		windowsUsed: Map<string, Decimal>;
		allocationUsed?: Map<string, Decimal>;
	}): CheckResult => {
		const deductionState: DeductionState = {
			remaining: new Decimal(request.value),
			terms: request.terms,
			deltas: [...moved],
			usageWindowConsumed: new Map(windowsUsed),
			allocationConsumed: allocationUsed && new Map(allocationUsed),
		};
		deductFromBuckets({ context, deductionState });
		const drawn = deductionStateToOutcome({ context, deductionState, request });
		return outcomeToCheckResult({
			fullSubject,
			command,
			outcome: { ...drawn, deltas: drawn.deltas.slice(moved.length) },
			precedingDeltas: moved,
		});
	};

	const moved = outcome.rejected ? [] : outcome.deltas;
	const windowsUsed = outcome.rejected
		? new Map()
		: outcome.usageWindowConsumed;
	const allocationUsed = outcome.rejected
		? undefined
		: outcome.allocationConsumed;
	return {
		after: checkWith({ moved, windowsUsed, allocationUsed }),
		before: () => checkWith({ moved: [], windowsUsed: new Map() }),
	};
};
