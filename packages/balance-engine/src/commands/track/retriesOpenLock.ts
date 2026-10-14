import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { TrackCommand, TrackLock } from "./types/trackCommand.js";

/** The retry names an expiry only when its caller set one; the server's 24-hour default is not a term. */
const namesExpiry = ({ lock }: { lock: TrackLock }): boolean =>
	lock.expiryAction === "release";

/**
 * The track asks again for the open lock `heldLock` is the row of, on the same terms: customer, entity, feature,
 * value, overage behaviour, and expiry when named. A row with no value cannot say its terms, so it never matches.
 */
export const retriesOpenLock = ({
	fullSubject,
	command,
	lock,
	heldLock,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
	lock: TrackLock;
	heldLock: WorkerLock | null;
}): boolean =>
	heldLock !== null &&
	fullSubject.open_locks.some(
		(openLock) =>
			openLock.id === heldLock.id && openLock.lock_id === lock.lockId,
	) &&
	heldLock.customer_id === command.identity.customerId &&
	heldLock.entity_id === command.identity.entityId &&
	heldLock.feature_id === command.featureId &&
	heldLock.value === command.value &&
	heldLock.overage_behavior === command.overageBehavior &&
	(!namesExpiry({ lock }) || heldLock.expires_at === lock.expiresAt);
