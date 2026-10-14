import type { TrackCommand } from "@autumn/balance-engine";

/** A lock_id open on other terms than its retry's. */
export class LockTermsConflictError extends Error {
	constructor({ lockId }: { lockId: string }) {
		super(`lock_id already used with different terms: ${lockId}`);
		this.name = "LockTermsConflictError";
	}
}

/** The retry asks for the lock `held` took, on its terms: the expiry counts only when the retry names one. */
export const isSameLock = ({
	held,
	retry,
}: {
	held: TrackCommand;
	retry: TrackCommand;
}): boolean =>
	held.identity.customerId === retry.identity.customerId &&
	held.identity.entityId === retry.identity.entityId &&
	held.featureId === retry.featureId &&
	held.value === retry.value &&
	held.overageBehavior === retry.overageBehavior &&
	(retry.lock?.expiryAction !== "release" ||
		held.lock?.expiresAt === retry.lock.expiresAt);
