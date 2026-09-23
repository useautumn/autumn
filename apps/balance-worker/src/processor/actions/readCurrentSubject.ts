import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { Subject } from "../subject/types/subject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { TriggeringCommand } from "./ensureSubjectCurrent/advanceResets.js";
import { ensureSubjectCurrent } from "./ensureSubjectCurrent/ensureSubjectCurrent.js";

/** The subject as the next command would see it: current by the command's clock, every earlier write counted. */
export const readCurrentSubject = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
}): Promise<Subject> => {
	const { ctx } = scope;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	await ensureSubjectCurrent({ scope, command });

	// Only outcomes pending at this moment, any reset just decided included; a track arriving later is not "earlier".
	await ctx.writer.waitForPendingCommits({ customerKey });
	ctx.assertCanRead();

	const state = ctx.writer.readFreshestState({ identity: command.identity });
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	return { state, catalog: ctx.subjectHydrator.readCatalog({ state }) };
};
