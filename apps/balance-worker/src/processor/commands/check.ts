import {
	type CheckCommand,
	checkCommandToDeductionRequest,
	computeCheck,
	slimSubjectForFeatures,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { readCurrentSubject } from "../actions/readCurrentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** A read of the subject made current (due resets advanced), then the check decided on it, once per view and second. */
export async function check({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): Promise<CheckReply> {
	const { state, catalog } = await readCurrentSubject({ scope, command });
	return timeSync({ label: "check.compute" }, () => {
		const fullSubject = scope.ctx.subjectHydrator.readSubject({
			state,
			identity: command.identity,
		});
		return scope.ctx.subjectDecisions.readCheckReply({
			fullSubject,
			request: checkCommandToDeductionRequest({ command }),
			// The caller reports this feature's balance, so the reply carries the rows that fund it, not the whole customer.
			answer: ({ context }) => ({
				result: computeCheck({ fullSubject, command, context }),
				...slimSubjectForFeatures({
					state,
					catalog,
					featureIds: [command.featureId],
				}),
			}),
		});
	});
}
