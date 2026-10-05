import {
	meteringIdentityToPartitionKey,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { resetMayBeDue } from "../actions/ensureSubjectCurrent/earliestResetAt.js";
import { isGoneMidRequest } from "../actions/withResidentSubject.js";
import { viewHasEntity } from "../subject/actions/ensureSubject/ensureSubjectState.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import { type DecidedAgainst, mutateTrack, toTrackReply } from "./track.js";

/** A track answered inline: its reply bytes, released once the partition's commit position reaches `seq`. */
export type InlineTrackOutcome = {
	body: string;
	/** The reply `body` serializes, for the request log; absent for a retry of a write in flight. */
	reply?: TrackReply;
	/** 0 when the reply may go out at once. */
	seq: number;
};

/** Why a track needs the ordinary path: a lock waits for the store, and the rest need the asynchronous ensure. */
export type InlineTrackRefusal =
	| "lock"
	| "not_resident"
	| "reset_due"
	| "catalog_evicted";

/** The ensure's own view, checked without awaiting: the rows (an entity's included), current resets and catalog. */
export function inlineTrackRefusalOf({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): InlineTrackRefusal | null {
	if (command.lock) return "lock";
	const { identity } = command;
	const resident = scope.ctx.writer.readFreshestState({ identity });
	if (!resident || !viewHasEntity({ state: resident, identity }))
		return "not_resident";
	if (resetMayBeDue({ state: resident, asOf: command.occurredAt }))
		return "reset_due";
	if (!hasResidentCatalog({ scope, state: resident })) return "catalog_evicted";
	return null;
}

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
 * A track decided synchronously against a resident, current subject, with its reply held by commit position.
 * Null hands it to the ordinary path; errors are the ones `track` raises.
 */
export function trackInline({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
}): InlineTrackOutcome | null {
	if (inlineTrackRefusalOf({ scope, command })) return null;
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
