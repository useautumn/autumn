import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import { FeatureType, findFeatureById } from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";

/** As long as the API holds a track's body key, so a command sent again inside it is applied once. */
const TRACK_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The key the worker claims, as the API claims it for the same call: a check's Idempotency-Key raw (the API's middleware),
 * a track's body key as `track:<key>` (getTrackBodyIdempotencyKey); with neither, this request's own id.
 */
const claimKeyOf = ({
	kind,
	idempotencyKey,
	requestId,
}: {
	kind: CheckRequest["kind"];
	idempotencyKey: string | null;
	requestId: string;
}): string => {
	if (idempotencyKey === null) return `track:${requestId}`;
	return kind === "track" ? `track:${idempotencyKey}` : idempotencyKey;
};

/**
 * The balance worker's own track for a deduction Atom granted, as the API builds a deducting check's: `overflow`, since
 * the units are already given. A flag is never usage-tracked, so the API refuses its send_event.
 */
export const trackToCommand = ({
	command,
	subject,
	skipEvent,
	idempotencyKey,
	kind,
}: {
	command: CheckCommand;
	subject: CurrentSubject;
	skipEvent: boolean;
	/** The caller's key as it sent it: the Idempotency-Key header on a check, the body's on a track. */
	idempotencyKey: string | null;
	kind: CheckRequest["kind"];
}): TrackCommand => {
	const feature = findFeatureById({
		features: subject.features,
		featureId: command.featureId,
	});
	if (feature?.type === FeatureType.Boolean)
		throw new CannotAnswerError({ reason: "send_event" });
	const { type: _, requiredBalance, ...base } = command;
	return {
		...base,
		type: "track",
		commandId: command.requestId,
		value: requiredBalance,
		// A track is the API's own track command; a deducting check's takes all it granted and honours the overdue block.
		...(kind === "track"
			? { overageBehavior: "cap" }
			: { overageBehavior: "overflow", enforceOverdueBlock: true }),
		usageEvent: skipEvent
			? null
			: {
					name: command.featureId,
					idempotencyKey: kind === "track" ? idempotencyKey : null,
					id: null,
				},
		idempotency: {
			// Never the caller's key as the request id: that is the claim's owner, and an owner claiming again is resumed.
			key: claimKeyOf({ kind, idempotencyKey, requestId: command.requestId }),
			ttlMs: TRACK_IDEMPOTENCY_TTL_MS,
		},
	};
};
