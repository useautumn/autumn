import type { CheckCommand } from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { serializeCheckReply } from "../../http/replies/serializeSubjectReply.js";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { computeCheckReply } from "./check.js";

/** A check answered on the hot path: the reply bytes, released at once (a check commits nothing). */
export type HotCheckOutcome = {
	status: number;
	body: string;
	/** The reply `body` serializes, for the request log. */
	reply: CheckReply;
	seq: 0;
};

/**
 * The hot check (serial-decide arm D): the same decision as `check`, made synchronously against a subject that
 * is already resident and current. Null hands the command to the ordinary path: rows not resident or a reset
 * due (the ensure that follows is asynchronous), tracks of the customer queued in a run (the check reads in
 * turn behind them), or rows that left the cache under the read (the ordinary path hydrates them back).
 */
export function checkHot({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: CheckCommand;
}): HotCheckOutcome | null {
	const { identity } = command;
	if (scope.trackRuns?.whenDecided({ identity })) return null;
	const state = scope.ctx.writer.readFreshestState({ identity });
	if (!state || resetMayBeDue({ state, asOf: command.occurredAt })) return null;
	scope.ctx.writer.assertCommitsHealthy();
	scope.ctx.assertCanRead();
	try {
		const catalog = scope.ctx.subjectHydrator.readCatalog({ state });
		const reply = computeCheckReply({
			scope,
			command,
			subject: { state, catalog },
		});
		return { status: 200, body: serializeCheckReply({ reply }), reply, seq: 0 };
	} catch (cause) {
		if (isGoneMidRequest(cause)) return null;
		throw cause;
	}
}
