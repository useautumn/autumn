import type { CheckCommand } from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import {
	type ResidentViewRefusal,
	residentViewRefusalOf,
} from "../actions/residentViewRefusalOf.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { checkReplyOf } from "./check.js";

/** Decided now; refused hands it to `check`, saying why. A check commits nothing, so its reply goes out at once. */
export type InlineCheckDecision =
	| { kind: "decided"; reply: CheckReply }
	| { kind: "refused"; reason: ResidentViewRefusal };

/** A check decided synchronously on a resident, current subject: the read `check` makes, minus the ensure. */
export function checkInline({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): InlineCheckDecision {
	const { identity } = command;
	const reason = residentViewRefusalOf({
		scope,
		identity,
		asOf: command.occurredAt,
	});
	if (reason) return { kind: "refused", reason };
	scope.ctx.writer.assertCommitsHealthy();
	scope.ctx.assertCanRead();
	const state = scope.ctx.writer.readFreshestState({ identity });
	if (!state) return { kind: "refused", reason: "not_resident" };
	try {
		const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
		const reply = checkReplyOf({ scope, command, subject: { state, catalog } });
		return { kind: "decided", reply };
	} catch (cause) {
		// Rows that left the cache under the read: the ordinary path hydrates them back.
		if (isGoneMidRequest(cause))
			return { kind: "refused", reason: "not_resident" };
		throw cause;
	}
}
