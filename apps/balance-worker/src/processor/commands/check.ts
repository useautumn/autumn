import {
	type CheckCommand,
	computeCheck,
	parseCheckCommand,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { readCurrentSubject } from "../actions/readCurrentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** A read of the subject, then the check decided on it. */
export async function check({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): Promise<CheckReply> {
	const parsed = parseCheckCommand({ input: command });
	const { state, catalog } = await readCurrentSubject({
		scope,
		command: parsed,
	});
	const result = timeSync({ label: "check.compute" }, () => {
		const fullSubject = scope.ctx.subjectHydrator.readSubject({
			state,
			identity: parsed.identity,
		});
		return computeCheck({ fullSubject, command: parsed });
	});
	return { result, state, catalog };
}
