import {
	meteringIdentityToPartitionKey,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import {
	type ResidentViewRefusal,
	residentViewRefusalOf,
} from "../actions/residentViewRefusalOf.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { HeldBlocker } from "../writer/types/partitionWriter.js";
import { type DecidedAgainst, mutateTrack, toTrackReply } from "./track.js";

export type InlineTrackOutcome = {
	body: string;
	reply?: TrackReply;
	seq: number;
};

export type InlineTrackRefusal = "lock" | ResidentViewRefusal;

export function inlineTrackRefusalOf({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): InlineTrackRefusal | null {
	if (command.lock) return "lock";
	return residentViewRefusalOf({
		scope,
		identity: command.identity,
		asOf: command.occurredAt,
	});
}

export type InlineTrackDecision =
	| ({ kind: "decided" } & InlineTrackOutcome)
	| { kind: "refused"; reason: InlineTrackRefusal | HeldBlocker };

export function trackInline({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): InlineTrackDecision {
	const reason = inlineTrackRefusalOf({ scope, command });
	if (reason) return { kind: "refused", reason };
	const outcome = decideTrackHeld({ scope, command });
	if (!outcome) return { kind: "refused", reason: "settled_write_in_flight" };
	return { kind: "decided", ...outcome };
}

export function decideTrackHeld({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): InlineTrackOutcome | null {
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	const decidedAgainst: DecidedAgainst = {};
	let reply: TrackReply | undefined;
	function replyOf(
		committed: Parameters<typeof toTrackReply>[0]["committed"],
	): string {
		reply = toTrackReply({ scope, command, committed, decidedAgainst });
		return JSON.stringify(reply);
	}
	const decision = scope.ctx.writer.decideHeld<never>({
		command,
		mutate: ({ state }) =>
			timeSync({ label: "track.decide" }, () =>
				mutateTrack({ scope, state, customerKey, command, decidedAgainst }),
			),
		replyOf,
	});
	if (!decision) return null;
	if (decision.kind === "reply")
		return { body: JSON.stringify(decision.reply), seq: 0 };
	return { body: decision.body, reply, seq: decision.seq };
}
