import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import type { CheckCommand } from "./types/checkCommand.js";

/** A check is a reject-mode dry run of the requirement that honours the org's overdue block. */
export const checkCommandToDeductionRequest = ({
	command,
}: {
	command: CheckCommand;
}): DeductionRequest => ({
	featureId: command.featureId,
	internalFeatureId: command.internalFeatureId,
	value: command.requiredBalance,
	overageBehavior: "reject",
	properties: command.properties,
	enforceOverdueBlock: true,
	now: command.occurredAt,
	org: command.org,
});
