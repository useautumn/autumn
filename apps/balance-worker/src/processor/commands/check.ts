import {
	type CheckCommand,
	computeCheck,
	slimSubjectForFeatures,
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
	const { state, catalog } = await readCurrentSubject({ scope, command });
	const result = timeSync({ label: "check.compute" }, () => {
		const fullSubject = scope.ctx.subjectHydrator.readSubject({
			state,
			identity: command.identity,
		});
		return computeCheck({ fullSubject, command });
	});
	// The caller reports this feature's balance, so the reply carries the rows that fund it, not the whole customer.
	return {
		result,
		...slimSubjectForFeatures({
			state,
			catalog,
			featureIds: [command.featureId],
		}),
	};
}
