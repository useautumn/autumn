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

export type InlineTrackBatchItem =
	| ({ ok: true } & Omit<InlineTrackOutcome, "seq">)
	| { ok: false; cause: unknown };

type DecidedItem =
	| ({ ok: true } & InlineTrackOutcome)
	| { ok: false; cause: unknown };

export type InlineTrackBatchOutcome =
	| {
			kind: "decided";
			items: InlineTrackBatchItem[];
			seq: number;
			commits: (Promise<void> | null)[] | null;
	  }
	| { kind: "refused"; reason: InlineTrackRefusal | HeldBlocker };

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
	const { result: items, fitsOneAppend } = scope.ctx.writer.decideHeldGroup({
		identities: commands.map((command) => command.identity),
		decide: () => decideEach({ scope, commands }),
	});
	let seq = 0;
	for (const item of items) if (item.ok) seq = Math.max(seq, item.seq);
	return {
		kind: "decided",
		items: items.map(withoutSeq),
		seq,
		commits: fitsOneAppend ? null : commitsOf({ scope, commands, items }),
	};
}

function withoutSeq(item: DecidedItem): InlineTrackBatchItem {
	if (!item.ok) return item;
	return { ok: true, body: item.body, reply: item.reply };
}

function commitsOf({
	scope,
	commands,
	items,
}: {
	scope: PartitionProcessorScope;
	commands: TrackCommand[];
	items: DecidedItem[];
}): (Promise<void> | null)[] {
	return items.map((item, index) => {
		const command = commands[index] as TrackCommand;
		if (!item.ok) return null;
		return scope.ctx.writer.waitForHeldCommit({
			identity: command.identity,
			commandId: command.commandId,
		});
	});
}

function decideEach({
	scope,
	commands,
}: {
	scope: PartitionProcessorScope;
	commands: TrackCommand[];
}): DecidedItem[] {
	const items: DecidedItem[] = [];
	for (const command of commands) {
		try {
			const outcome = decideTrackHeld({ scope, command });
			if (!outcome)
				throw new Error("A cleared inline track was refused by the writer");
			items.push({ ok: true, ...outcome });
		} catch (cause) {
			if (cause instanceof PartitionWriterRecoveryRequiredError) throw cause;
			items.push({ ok: false, cause });
		}
	}
	return items;
}
