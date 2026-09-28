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

/** The same check on both sides of a deduction. */
export type CheckAfterDeduction = {
	/** What a check on the committed state would say. */
	after: CheckResult;
	/** What it said before the deduction; on demand, since a check still allowed after never needs it. */
	before: () => CheckResult;
};

/**
 * A check asked right after a deduction, drawn on the deduction's own rows when the check selects the same ones,
 * else on rows set up for it. Either way the after side never rebuilds the subject.
 */
export const checkAfterDeduction = ({
	fullSubject,
	command,
	outcome,
}: {
	fullSubject: WorkerFullSubject;
	command: CheckCommand;
	/** The deduction the check follows, decided on this subject. */
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

	/** Draws the check with the deduction's moves already on the rows; with none, it reads the stored balances. */
	const checkWith = ({
		moved,
		windowsUsed,
	}: {
		moved: DeductionDelta[];
		windowsUsed: Map<string, Decimal>;
	}): CheckResult => {
		const deductionState: DeductionState = {
			remaining: new Decimal(request.value),
			terms: request.terms,
			deltas: [...moved],
			usageWindowConsumed: new Map(windowsUsed),
		};
		deductFromBuckets({ context, deductionState });
		const drawn = deductionStateToOutcome({ context, deductionState, request });
		// The deduction's moves were the starting point, not the check's own draw.
		return outcomeToCheckResult({
			fullSubject,
			command,
			outcome: { ...drawn, deltas: drawn.deltas.slice(moved.length) },
			precedingDeltas: moved,
		});
	};

	// A refused deduction moved nothing, so the after side reads the stored balances too.
	const moved = outcome.rejected ? [] : outcome.deltas;
	const windowsUsed = outcome.rejected
		? new Map()
		: outcome.usageWindowConsumed;
	return {
		after: checkWith({ moved, windowsUsed }),
		before: () => checkWith({ moved: [], windowsUsed: new Map() }),
	};
};
