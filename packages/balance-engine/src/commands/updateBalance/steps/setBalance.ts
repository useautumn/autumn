import {
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	deductFromBuckets,
	deductionStateToOutcome,
} from "../../../deduction/deduct.js";
import { setupDeductionContext } from "../../../deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../../deduction/types/deductionContext.js";
import type { DeductionOutcome } from "../../../deduction/types/deductionOutcome.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import type { UpdateBalanceCommand } from "../types/updateBalanceCommand.js";
import { updateBalanceCommandToDeductionRequest } from "../updateBalanceCommandToDeductionRequest.js";

/** Legacy `getUpdateUsageTargetBalance`: usage is what the rows' grant and prepaid quantity no longer hold. */
const usageToTargetBalance = ({
	context,
	usage,
}: {
	context: DeductionContext;
	usage: number;
}): number => {
	const granted = cusEntsToGrantedBalance({
		cusEnts: context.customerEntitlements,
		entityId: context.entityId ?? undefined,
	});
	const prepaid = cusEntsToPrepaidQuantity({
		cusEnts: context.customerEntitlements,
		sumAcrossEntities: context.entityId === null,
	});
	return new Decimal(granted).plus(prepaid).minus(usage).toNumber();
};

const updateBalanceCommandToTargetBalance = ({
	command,
	context,
}: {
	command: UpdateBalanceCommand;
	context: DeductionContext;
}): number | null => {
	if (command.remaining !== undefined) return command.remaining;
	if (command.usage !== undefined)
		return usageToTargetBalance({ context, usage: command.usage });
	return null;
};

/** The Lua's `get_total_balance`: every drawn balance, or only the leading unlimited row's, which the target sets outright. */
const deductionContextToCurrentBalance = ({
	context,
}: {
	context: DeductionContext;
}): Decimal => {
	const [firstRow] = context.rows;
	const counted = firstRow?.unlimited
		? context.rows.filter((row) => row.id === firstRow.id)
		: context.rows;
	return counted.reduce(
		(total, row) => total.plus(row.balance),
		new Decimal(0),
	);
};

/** Moves the balance to a target, or by an amount; the gap is drawn like a track, rollovers first, so they stay out of the sum. */
export const setBalance = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): DeductionOutcome => {
	const baseRequest = updateBalanceCommandToDeductionRequest({ command });
	const context = setupDeductionContext({
		fullSubject,
		selection: baseRequest.selection,
	});
	const targetBalance = updateBalanceCommandToTargetBalance({
		command,
		context,
	});
	const value =
		targetBalance === null
			? baseRequest.value
			: deductionContextToCurrentBalance({ context })
					.minus(targetBalance)
					.toNumber();
	const request = { ...baseRequest, value };
	const deductionState = {
		remaining: new Decimal(request.value),
		terms: request.terms,
		deltas: [],
		usageWindowConsumed: new Map(),
	};
	deductFromBuckets({ context, deductionState });
	return deductionStateToOutcome({ context, deductionState, request });
};
