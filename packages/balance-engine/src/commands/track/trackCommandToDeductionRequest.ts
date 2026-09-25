import { toDeductionSelection } from "../../deduction/toDeductionSelection.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import type { TrackCommand } from "./types/trackCommand.js";

export const trackCommandToDeductionRequest = ({
	command,
}: {
	command: TrackCommand;
}): DeductionRequest => ({
	selection: toDeductionSelection({
		featureId: command.featureId,
		internalFeatureId: command.internalFeatureId,
		now: command.occurredAt,
		properties: command.properties,
		includesCreditSystems: true,
		countsUsageWindows: true,
		org: command.org,
		enforceOverdueBlock: command.enforceOverdueBlock ?? false,
	}),
	terms: { overageBehavior: command.overageBehavior, enforcesSpendLimit: true },
	value: command.value,
});
