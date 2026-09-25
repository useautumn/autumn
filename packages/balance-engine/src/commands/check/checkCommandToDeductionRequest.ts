import { toDeductionSelection } from "../../deduction/toDeductionSelection.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import type { CheckCommand } from "./types/checkCommand.js";

/** A check is a reject-mode dry run of the requirement that honours the org's overdue block. */
export const checkCommandToDeductionRequest = ({
	command,
}: {
	command: CheckCommand;
}): DeductionRequest => ({
	selection: toDeductionSelection({
		featureId: command.featureId,
		internalFeatureId: command.internalFeatureId,
		now: command.occurredAt,
		properties: command.properties,
		includesCreditSystems: true,
		countsUsageWindows: true,
		org: command.org,
		enforceOverdueBlock: true,
	}),
	terms: { overageBehavior: "reject", enforcesSpendLimit: true },
	value: command.requiredBalance,
});
