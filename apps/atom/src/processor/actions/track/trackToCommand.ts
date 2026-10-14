import {
	type CheckCommand,
	lockParamsToTrackLock,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	type CheckLockParams,
	FeatureType,
	featureUtils,
	findFeatureById,
} from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CurrentSubject } from "../../types/currentSubject.js";

/** As long as the API holds a track's body key, so a command sent again inside it is applied once. */
const TRACK_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** The worker's claim. Never on the caller's key as the request id: that is the claim's owner, and an owner claiming again is resumed. */
const claimOf = ({ key }: { key: string }) => ({
	key,
	ttlMs: TRACK_IDEMPOTENCY_TTL_MS,
});

/**
 * The API's own track of the engine's check, as the balance worker applies it: what fits (`cap`), its usage event and its
 * claim keyed by the body's key (`track:<key>`, getTrackBodyIdempotencyKey), or by this request's own id. A flag is never
 * usage-tracked, so the API refuses it.
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
		overageBehavior: "cap",
		usageEvent: skipEvent
			? null
			: { name: command.featureId, idempotencyKey, id: null },
		idempotency: claimOf({
			key: `track:${idempotencyKey ?? command.requestId}`,
		}),
	};
};

/**
 * A lock granted here is handed in as granted (`overflow`), a capped one as capped; its row keeps the caller's overage
 * behaviour for a finalize above it, as the API's does. The API refuses one on an allocated feature.
 */
const lockedTrackOf = ({
	lock,
	command,
	subject,
}: {
	lock: CheckLockParams;
	command: CheckCommand;
	subject: CurrentSubject;
}): Pick<TrackCommand, "overageBehavior" | "lock"> => {
	const feature = findFeatureById({
		features: subject.features,
		featureId: command.featureId,
	});
	if (feature && featureUtils.isAllocated(feature))
		throw new CannotAnswerError({ reason: "lock_unsupported" });
	const overageBehavior = lock.overage_behavior ?? "reject";
	return {
		overageBehavior: overageBehavior === "cap" ? "cap" : "overflow",
		lock: {
			...lockParamsToTrackLock({ lock, occurredAt: command.occurredAt }),
			overageBehavior,
		},
	};
};

/**
 * A deducting check's track, as the API builds it: all it granted (`overflow`), honouring the overdue block, with no event
 * key; a lock's own overage behaviour instead. The API's middleware claims a check's Idempotency-Key raw.
 */
export const checkToTrackCommand = ({
	command,
	subject,
	skipEvent,
	idempotencyKey,
	lock,
}: {
	command: CheckCommand;
	subject: CurrentSubject;
	skipEvent: boolean;
	/** The caller's Idempotency-Key header. */
	idempotencyKey: string | null;
	lock: CheckLockParams | null;
}): TrackCommand => ({
	...trackToCommand({ command, subject, skipEvent, idempotencyKey: null }),
	overageBehavior: "overflow",
	enforceOverdueBlock: true,
	idempotency: claimOf({ key: idempotencyKey ?? `track:${command.requestId}` }),
	...(lock && lockedTrackOf({ lock, command, subject })),
});
