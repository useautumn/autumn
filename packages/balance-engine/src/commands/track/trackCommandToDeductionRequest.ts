import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import type { TrackCommand } from "./types/trackCommand.js";

export const trackCommandToDeductionRequest = ({
	command,
}: {
	command: TrackCommand;
}): DeductionRequest => ({
	featureId: command.featureId,
	internalFeatureId: command.internalFeatureId,
	value: command.value,
	overageBehavior: command.overageBehavior,
	properties: command.properties,
	enforceOverdueBlock: false,
	now: command.occurredAt,
	org: command.org,
});
