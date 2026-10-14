import {
	meteringIdentityToPartitionKey,
	type ReadSubjectStateCommand,
} from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { readResidentSubject } from "../actions/readCurrentSubject.js";
import { readLogOffset } from "../actions/readLogOffset.js";
import { withResidentSubject } from "../actions/withResidentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export async function readSubjectState({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ReadSubjectStateCommand;
}): Promise<ReadSubjectStateReply> {
	return withResidentSubject<ReadSubjectStateReply>({
		customerKey: meteringIdentityToPartitionKey({
			identity: command.identity,
		}),
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () => {
			const subject = readResidentSubject({ scope, command });
			if (!subject) return null;
			return {
				state: subject.state,
				catalog: subject.catalog,
				logOffset: readLogOffset({ scope }).toString(),
			};
		},
	});
}
