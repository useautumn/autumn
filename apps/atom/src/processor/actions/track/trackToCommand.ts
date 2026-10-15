import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import { FeatureType, findFeatureById } from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CurrentSubject } from "../../types/currentSubject.js";

/** As long as the API holds a track's body key, so a command sent again inside it is applied once. */
const TRACK_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The balance worker's own track for a deduction Atom granted, as the API builds a deducting check's: `overflow`, since
 * the units are already given. A flag is never usage-tracked, so the API refuses its send_event.
 */
export const trackToCommand = ({
	command,
	subject,
	skipEvent,
	idempotencyKey,
}: {
	command: CheckCommand;
	subject: CurrentSubject;
	skipEvent: boolean;
	/** The caller's Idempotency-Key, claimed raw as the API's middleware claims it; else this check's request id. */
	idempotencyKey: string | null;
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
		overageBehavior: "overflow",
		enforceOverdueBlock: true,
		usageEvent: skipEvent
			? null
			: { name: command.featureId, idempotencyKey: null, id: null },
		idempotency: {
			// Never the caller's key as the request id: that is the claim's owner, and an owner claiming again is resumed.
			key: idempotencyKey ?? `track:${command.requestId}`,
			ttlMs: TRACK_IDEMPOTENCY_TTL_MS,
		},
	};
};
