import type { CheckCommand } from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { residentViewRefusalOf } from "../actions/residentViewRefusalOf.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { checkReplyOf } from "./check.js";

/**
 * A check decided synchronously on a resident, current subject: the read `check` makes, minus the ensure.
 * Null hands it to `check`; a check commits nothing, so its reply goes out at once.
 */
export function checkInline({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): CheckReply | null {
	const { identity } = command;
	if (residentViewRefusalOf({ scope, identity, asOf: command.occurredAt }))
		return null;
	scope.ctx.writer.assertCommitsHealthy();
	scope.ctx.assertCanRead();
	const state = scope.ctx.writer.readFreshestState({ identity });
	if (!state) return null;
	try {
		const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
		return checkReplyOf({ scope, command, subject: { state, catalog } });
	} catch (cause) {
		// Rows that left the cache under the read: the ordinary path hydrates them back.
		if (isGoneMidRequest(cause)) return null;
		throw cause;
	}
}
