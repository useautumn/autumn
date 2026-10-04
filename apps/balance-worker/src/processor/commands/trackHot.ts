import {
	meteringIdentityToPartitionKey,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { serializeSubjectReply } from "../../http/replies/serializeSubjectReply.js";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import { viewHasEntity } from "../subject/actions/ensureSubject/ensureSubjectState.js";
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

/** Why a track cannot be decided synchronously here; the ordinary path's ensure or queue handles it. */
export type HotTrackRefusal =
	| "lock"
	| "track_run"
	| "not_resident"
	| "reset_due"
	| "catalog_evicted";

/**
 * A lock needs store durability, tracks queued in a run decide in turn behind it, and rows not resident (an
 * entity's included), a reset due or catalog rows gone from the cache need the asynchronous ensure first.
 */
export function hotTrackRefusalOf({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): HotTrackRefusal | null {
	if (command.lock) return "lock";
	const { identity } = command;
	if (scope.trackRuns?.whenDecided({ identity })) return "track_run";
	const resident = scope.ctx.writer.readFreshestState({ identity });
	if (!resident || !viewHasEntity({ state: resident, identity }))
		return "not_resident";
	if (resetMayBeDue({ state: resident, asOf: command.occurredAt }))
		return "reset_due";
	if (!hasResidentCatalog({ scope, state: resident })) return "catalog_evicted";
	return null;
}

/** The decision joins the state's catalog rows synchronously; the join is kept, so the decide reuses it. */
function hasResidentCatalog({
	scope,
	state,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState;
}): boolean {
	try {
		scope.ctx.subjectHydrator.readCatalog({ state });
		return true;
	} catch (cause) {
		if (isGoneMidRequest(cause)) return false;
		throw cause;
	}
}

/**
 * The hot track (serial-decide arm D): decided synchronously against a resident, current subject with
 * the writer's lean decide, the reply built here and released by commit position. Null hands the
 * command to the ordinary path: any `hotTrackRefusalOf` reason, or a classic command of the customer in
 * flight. Errors are the same ones `track` raises; the caller renders them as it does there.
 */
export function trackHot({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): HotTrackOutcome | null {
	if (hotTrackRefusalOf({ scope, command })) return null;
	return decideTrackLean({ scope, command });
}

/** The lean decide itself, for a command already cleared by `hotTrackRefusalOf`. */
export function decideTrackLean({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): HotTrackOutcome | null {
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
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
			return serializeSubjectReply({ reply });
		},
	});
	if (!decision) return null;
	if (decision.kind === "reply")
		return { status: 200, body: JSON.stringify(decision.reply), seq: 0 };
	return { status: 200, body: decision.body, reply, seq: decision.seq };
}
