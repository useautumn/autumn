import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type { Subject } from "../subject/types/subject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { TriggeringCommand } from "./ensureSubjectCurrent/advanceResets.js";
import { ensureSubjectCurrent } from "./ensureSubjectCurrent/ensureSubjectCurrent.js";
import { withResidentSubject } from "./withResidentSubject.js";

export const readCurrentSubject = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
}): Promise<Subject> => {
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	return withResidentSubject<Subject>({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () => readResidentSubject({ scope, command }),
	});
};

export const readResidentSubject = ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TriggeringCommand;
}): Subject | null => {
	const { ctx } = scope;
	ctx.writer.assertCommitsHealthy();
	ctx.assertCanRead();

	const state = ctx.writer.readFreshestState({ identity: command.identity });
	if (!state) return null;
	return { state, catalog: ctx.subjectHydrator.readCatalog({ state }) };
};
