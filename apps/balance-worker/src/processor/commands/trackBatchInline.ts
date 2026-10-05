import type { TrackCommand } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { HeldBlocker } from "../writer/types/partitionWriter.js";
import { PartitionWriterRecoveryRequiredError } from "../writer/writerErrors.js";
import {
	decideTrackHeld,
	type InlineTrackOutcome,
	type InlineTrackRefusal,
	inlineTrackRefusalOf,
} from "./trackInline.js";

/** One command's answer, in the batch's order: its reply, or the error `track` would have raised. */
export type InlineTrackBatchItem =
	| ({ ok: true } & Omit<InlineTrackOutcome, "seq">)
	| { ok: false; cause: unknown };

export type InlineTrackBatchOutcome =
	| {
			kind: "decided";
			items: InlineTrackBatchItem[];
			/** The batch's reply is held until the commit position reaches its last write; 0 when it wrote nothing. */
			seq: number;
	  }
	| { kind: "refused"; reason: InlineTrackRefusal | HeldBlocker };

/**
 * A track batch decided inline, whole or not at all: every command is cleared before any is decided. Its writes
 * share one held group, so one append carries them and a failed append fails each, as on the ordinary path.
 */
export function trackBatchInline({
	scope,
	commands,
}: {
	scope: PartitionProcessorScope;
	commands: TrackCommand[];
}): InlineTrackBatchOutcome {
	for (const command of commands) {
		const reason =
			inlineTrackRefusalOf({ scope, command }) ??
			scope.ctx.writer.heldBlocker({
				identity: command.identity,
				commandId: command.commandId,
			});
		if (reason) return { kind: "refused", reason };
	}
	return scope.ctx.writer.decideHeldGroup(() =>
		decideEach({ scope, commands }),
	);
}

function decideEach({
	scope,
	commands,
}: {
	scope: PartitionProcessorScope;
	commands: TrackCommand[];
}): InlineTrackBatchOutcome {
	const items: InlineTrackBatchItem[] = [];
	let seq = 0;
	for (const command of commands) {
		try {
			const outcome = decideTrackHeld({ scope, command });
			if (!outcome)
				throw new Error("A cleared inline track was refused by the writer");
			items.push({ ok: true, body: outcome.body, reply: outcome.reply });
			seq = Math.max(seq, outcome.seq);
		} catch (cause) {
			// A writer in recovery refuses every command; the runtime takes the partition down, as for `process`.
			if (cause instanceof PartitionWriterRecoveryRequiredError) throw cause;
			items.push({ ok: false, cause });
		}
	}
	return { kind: "decided", items, seq };
}
