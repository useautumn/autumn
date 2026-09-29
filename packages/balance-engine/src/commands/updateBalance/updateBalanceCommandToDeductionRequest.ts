import { toBalanceEditRequest } from "../../deduction/toBalanceEditRequest.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";

/** `remaining` or `usage`: the command sets the feature's own rows to a target rather than moving them by an amount. */
export const hasBalanceTarget = ({
	command,
}: {
	command: UpdateBalanceCommand;
}): boolean => command.remaining !== undefined || command.usage !== undefined;

/** A target sets the feature's own rows and is not consumption; an amount draws like a track, credit systems included, and a draw down counts toward windows. */
export const updateBalanceCommandToDeductionRequest = ({
	command,
}: {
	command: UpdateBalanceCommand;
}): DeductionRequest => {
	const setsTarget = hasBalanceTarget({ command });
	const amount = setsTarget ? 0 : -(command.addToBalance ?? 0);
	return toBalanceEditRequest({
		featureId: command.featureId,
		internalFeatureId: command.internalFeatureId,
		value: amount,
		includesCreditSystems: !setsTarget,
		countsUsageWindows: amount > 0,
		customerEntitlementFilters: command.customerEntitlementFilters,
		org: command.org,
		now: command.occurredAt,
	});
};
