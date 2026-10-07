// Misc-cache Lua scripts, imported as text (works with both Bun and esbuild)
// and registered as commands in registerRedisCommands.

import deleteOwnedLockScript from "./lock/deleteOwnedLock.lua";
import refreshOwnedLockScript from "./lock/refreshOwnedLock.lua";
import acquireQueuePermitsScript from "./queueCapacityLease/acquireQueuePermits.lua";
import releaseQueuePermitScript from "./queueCapacityLease/releaseQueuePermit.lua";
import incrementOrgThenCustomerScript from "./rateLimit/incrementOrgThenCustomer.lua";

/** Owner-checked lock release: delete only if the token is still mine.
 *  Accepts bare-token or acquireLock's {errorMessage, token} envelope values. */
export const DELETE_OWNED_LOCK_SCRIPT = deleteOwnedLockScript;

/** Owner-checked lease extension (PEXPIRE) — same value handling as delete. */
export const REFRESH_OWNED_LOCK_SCRIPT = refreshOwnedLockScript;

/** Claim up to N queue-concurrency permits in a scored set (expiry = score). */
export const ACQUIRE_QUEUE_PERMITS_SCRIPT = acquireQueuePermitsScript;

/** Release one queue-concurrency permit; drops the set when empty. */
export const RELEASE_QUEUE_PERMIT_SCRIPT = releaseQueuePermitScript;

/** Count a rate-limit org key, then its customer key unless the org is over its cap. */
export const INCREMENT_ORG_THEN_CUSTOMER_SCRIPT =
	incrementOrgThenCustomerScript;
