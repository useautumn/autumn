import {
	parseReadSubjectStateCommand,
	type ReadSubjectStateCommand,
} from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import { readCurrentSubject } from "../actions/readCurrentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** The subject as the next command would see it; nothing is decided on it. */
export async function readSubjectState({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ReadSubjectStateCommand;
}): Promise<ReadSubjectStateReply> {
	const parsed = parseReadSubjectStateCommand({ input: command });
	return readCurrentSubject({ scope, command: parsed });
}
