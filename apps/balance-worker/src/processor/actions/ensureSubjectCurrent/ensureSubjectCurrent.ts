import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import { advanceResets, type TriggeringCommand } from "./advanceResets.js";
import { resetMayBeDue } from "./earliestResetAt.js";
import { readResetInputs } from "./readResetInputs.js";

export const ensureSubjectCurrent = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
}): Promise<void> => {
	await scope.ctx.subjectHydrator.ensure({ identity: command.identity });
	const state = scope.ctx.writer.readFreshestState({
		identity: command.identity,
	});
	if (state && !resetMayBeDue({ state, asOf: command.occurredAt })) return;
	const inputs = await readResetInputs({ scope, command });
	advanceResets({ scope, command, inputs });
};
