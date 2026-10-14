import type { TrackLock } from "@autumn/balance-engine";
import { generateKsuid } from "@autumn/ksuid";
import { type LockParams, ms } from "@autumn/shared";

const DEFAULT_LOCK_LIFETIME_MS = ms.hours(24);

export function lockParamsToTrackLock({
	lock,
	occurredAt,
}: {
	lock: LockParams;
	occurredAt: number;
}): TrackLock {
	const callerSetExpiry = lock.expires_at !== undefined;
	return {
		id: generateKsuid({ prefix: "lck" }),
		lockId: lock.lock_id,
		expiresAt: lock.expires_at ?? occurredAt + DEFAULT_LOCK_LIFETIME_MS,
		expiryAction: callerSetExpiry ? "release" : "confirm",
	};
}
