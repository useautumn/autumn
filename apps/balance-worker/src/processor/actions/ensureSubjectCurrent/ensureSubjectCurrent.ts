import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import { advanceResets, type TriggeringCommand } from "./advanceResets.js";
import { readResetInputs } from "./readResetInputs.js";

/** A subject is current for a command when its rows are resident and its cycles are up to the command's clock. */
export const ensureSubjectCurrent = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
}): Promise<void> => {
	await scope.ctx.subjectHydrator.ensure({ identity: command.identity });
	const inputs = await readResetInputs({ scope, command });
	advanceResets({ scope, command, inputs });
};
