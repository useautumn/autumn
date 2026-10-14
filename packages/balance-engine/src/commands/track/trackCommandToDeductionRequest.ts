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
		countsAllocations: true,
		org: command.org,
		enforceOverdueBlock: command.enforceOverdueBlock ?? false,
	}),
	// An Atom's track deducts units it already granted, so Autumn mirrors its answer; cap still caps (the Atom held only what fit).
	terms: {
		overageBehavior:
			command.source && command.overageBehavior !== "cap"
				? "overflow"
				: command.overageBehavior,
		enforcesSpendLimit: true,
	},
	value: command.value,
});
