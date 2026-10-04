import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { OwnedPartitionRecoveryRequiredError } from "../../runtime/runtimeErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { LeanBlocker } from "../writer/types/partitionWriter.js";
import { PartitionWriterRecoveryRequiredError } from "../writer/writerErrors.js";
import {
	decideTrackLean,
	type HotTrackRefusal,
	hotTrackRefusalOf,
} from "./trackHot.js";

export type HotTrackBatchRefusal = HotTrackRefusal | LeanBlocker;

/** One command's answer, in the batch's order: its reply bytes, or the error `track` would have raised. */
export type HotTrackBatchItem =
	| { ok: true; body: string; reply?: TrackReply }
	| { ok: false; cause: unknown };

export type HotTrackBatchOutcome =
	| {
			kind: "decided";
			items: HotTrackBatchItem[];
			/** The batch's reply is held until the commit position reaches its last write; 0 when it wrote nothing. */
			seq: number;
	  }
	| { kind: "refused"; reason: HotTrackBatchRefusal };

/**
 * A track batch on the hot path (serial-decide arm D). Every command is cleared before any is decided, so the
 * batch goes hot whole or not at all. The writes share one lean group, so they land in one append: a failed
 * append fails each of them, as it would on the ordinary path. A per-command error stays that command's.
 */
export function trackBatchHot({
	scope,
	commands,
}: {
	scope: PartitionProcessorScope;
	commands: TrackCommand[];
}): HotTrackBatchOutcome {
	for (const command of commands) {
		const reason =
			hotTrackRefusalOf({ scope, command }) ??
			scope.ctx.writer.leanBlocker({
				identity: command.identity,
				commandId: command.commandId,
			});
		if (reason) return { kind: "refused", reason };
	}
	return scope.ctx.writer.decideLeanGroup(() =>
		decideEach({ scope, commands }),
	);
}

function decideEach({
	scope,
	commands,
}: {
	scope: PartitionProcessorScope;
	commands: TrackCommand[];
}): HotTrackBatchOutcome {
	const items: HotTrackBatchItem[] = [];
	let seq = 0;
	for (const command of commands) {
		try {
			const hot = decideTrackLean({ scope, command });
			if (!hot)
				throw new Error("A cleared hot track was refused by the writer");
			items.push({ ok: true, body: hot.body, reply: hot.reply });
			seq = Math.max(seq, hot.seq);
		} catch (cause) {
			if (failsTheWholePartition(cause)) throw cause;
			items.push({ ok: false, cause });
		}
	}
	return { kind: "decided", items, seq };
}

/** A writer in recovery refuses every command: the runtime takes it down, as it does for `process`. */
function failsTheWholePartition(cause: unknown): boolean {
	return (
		cause instanceof PartitionWriterRecoveryRequiredError ||
		cause instanceof OwnedPartitionRecoveryRequiredError
	);
}
