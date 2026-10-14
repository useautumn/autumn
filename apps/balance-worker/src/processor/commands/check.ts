import {
	type CheckCommand,
	computeCheck,
	slimSubjectForFeatures,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { readCurrentSubject } from "../actions/readCurrentSubject.js";
import type { Subject } from "../subject/types/subject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export async function check({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): Promise<CheckReply> {
	const subject = await readCurrentSubject({ scope, command });
	return checkReplyOf({ scope, command, subject });
}

export function checkReplyOf({
	scope,
	command,
	subject: { state, catalog },
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
	subject: Subject;
}): CheckReply {
	const result = timeSync({ label: "check.compute" }, () => {
		const fullSubject = scope.ctx.subjectHydrator.readSubject({
			state,
			identity: command.identity,
		});
		return computeCheck({ fullSubject, command });
	});
	return {
		result,
		...slimSubjectForFeatures({
			state,
			catalog,
			featureIds: [command.featureId],
		}),
	};
}
