import {
	meteringIdentityToPartitionKey,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { type DecidedAgainst, mutateTrack, toTrackReply } from "./track.js";

/** A track answered on the hot path: the reply bytes, released once the partition's commit position reaches `seq`. */
export type HotTrackOutcome = {
	status: number;
	body: string;
	/** The reply `body` serializes, for the request log. */
	reply?: TrackReply;
	/** 0 when the reply may go out at once. */
	seq: number;
};

/**
 * The hot track (serial-decide arm D): decided synchronously against a resident, current subject with
 * the writer's lean decide, the reply built here and released by commit position. Null hands the
 * command to the ordinary path: a lock (store durability), rows
 * not resident or a reset due (the ensure that follows is asynchronous), or a classic command of the
 * customer in flight. Errors are the same ones `track` raises; the caller renders them as it does there.
 */
export function trackHot({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): HotTrackOutcome | null {
	if (command.lock) return null;
	const { identity } = command;
	const resident = scope.ctx.writer.readFreshestState({ identity });
	if (!resident || resetMayBeDue({ state: resident, asOf: command.occurredAt }))
		return null;
	const customerKey = meteringIdentityToPartitionKey({ identity });
	const decidedAgainst: DecidedAgainst = {};
	let reply: TrackReply | undefined;
	const decision = scope.ctx.writer.decideLean<never>({
		command,
		mutate: ({ state }) =>
			timeSync({ label: "track.decide" }, () =>
				mutateTrack({ scope, state, customerKey, command, decidedAgainst }),
			),
		replyOf: (committed) => {
			reply = toTrackReply({ scope, command, committed, decidedAgainst });
			return JSON.stringify(reply);
		},
	});
	if (!decision) return null;
	if (decision.kind === "reply")
		return { status: 200, body: JSON.stringify(decision.reply), seq: 0 };
	return { status: 200, body: decision.body, reply, seq: decision.seq };
}
