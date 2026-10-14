import { toBalanceEditRequest } from "../../deduction/toBalanceEditRequest.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";

export const hasBalanceTarget = ({
	command,
}: {
	command: UpdateBalanceCommand;
}): boolean => command.remaining !== undefined || command.usage !== undefined;

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
